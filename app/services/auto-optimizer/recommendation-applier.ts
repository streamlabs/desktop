import { cloneDeep, isEqual } from 'lodash';
import type { ISettingsSubCategory, SettingsService } from 'services/settings';
import type {
  EEncoderFamily,
  IOutputSettings,
  OutputSettingsService,
} from 'services/settings/output';
import type { EncoderQueryService } from 'services/settings/output/encoder-query';
import { encoderPresetFromSettingsValue } from '../settings/output/encoder-settings-policy';
import type { TDisplayType, VideoSettingsService } from 'services/settings-v2/video';
import {
  buildAutoOptimizerVideoSettingsPatches,
  captureRawOutputValues,
  outputTransactionValuesMatch,
  selectAutoOptimizerStandardOutputRecommendation,
  shouldApplyAutoOptimizerVideoSettings,
  shouldCaptureTargetPresetForRollback,
  TRawOutputValues,
} from './output-transaction-policy';
import { autoOptimizerPromotesResolution } from './resolution-policy';
import {
  IAutoOptimizerOutputResult,
  IAutoOptimizerProfile,
  IAutoOptimizerResult,
  TAutoOptimizerStreamSetupType,
} from './types';

export interface IAutoOptimizerRecommendationApplierDependencies {
  outputSettings: Pick<OutputSettingsService, 'getSettings' | 'setSettings'>;
  encoderQuery: Pick<EncoderQueryService, 'resolveStreamingEncoderPreset'>;
  settings: Pick<SettingsService, 'state' | 'findSettingValue' | 'findSetting' | 'setSettings'>;
  videoSettings: Pick<
    VideoSettingsService,
    'state' | 'contexts' | 'flushPendingCanvasSettings' | 'applyAutoOptimizerSettings'
  >;
}

interface ISettingsSnapshot {
  output: IOutputSettings;
  rawOutputFormData: ISettingsSubCategory[];
  rawOutputValues: TRawOutputValues;
  targetPreset?: ITargetEncoderPresetSnapshot;
  horizontalVideo: typeof VideoSettingsService.prototype.state.horizontal;
  verticalVideo: typeof VideoSettingsService.prototype.state.vertical;
  liveVideoDisplays: TDisplayType[];
}

interface ITargetEncoderPresetSnapshot {
  mode: IOutputSettings['mode'];
  encoderId: string;
  encoderFamily: EEncoderFamily;
  field: string;
  value: string;
}

/**
 * Apply one accepted Auto Optimizer result as an all-or-nothing settings
 * transaction. The returned profile is safe to persist only after both the
 * settings documents and live OBS video contexts have been verified.
 */
export async function applyAutoOptimizerRecommendations(
  result: IAutoOptimizerResult,
  streamSetupType: TAutoOptimizerStreamSetupType,
  dependencies: IAutoOptimizerRecommendationApplierDependencies,
): Promise<IAutoOptimizerProfile> {
  return new RecommendationApplyTransaction(dependencies).apply(result, streamSetupType);
}

class RecommendationApplyTransaction {
  constructor(private readonly dependencies: IAutoOptimizerRecommendationApplierDependencies) {}

  async apply(
    result: IAutoOptimizerResult,
    streamSetupType: TAutoOptimizerStreamSetupType,
  ): Promise<IAutoOptimizerProfile> {
    if (!result.outputs.length) throw new Error('No recommendations to apply');

    // A Settings-window canvas edit may still be inside its 200 ms batching
    // window when the user accepts the result. Apply it before capturing the
    // rollback snapshot or computing the non-shrinking accepted Base Canvas.
    await this.dependencies.videoSettings.flushPendingCanvasSettings();
    const snapshot = this.captureSettingsSnapshot();
    const primary =
      result.outputs.find(output => output.display === 'horizontal') || result.outputs[0];
    const outputRecommendation = selectAutoOptimizerStandardOutputRecommendation(result.outputs);
    const frameRateSignatures = new Set(
      result.outputs.flatMap(output => [
        `${output.fpsNum}/${output.fpsDen}`,
        ...(output.additionalVideo
          ? [`${output.additionalVideo.fpsNum}/${output.additionalVideo.fpsDen}`]
          : []),
      ]),
    );
    if (frameRateSignatures.size > 1) {
      throw new Error('This stream setup cannot apply different frame rates per output');
    }

    const twitchManagesEncoding = outputRecommendation === null;
    const applyVideoSettings = shouldApplyAutoOptimizerVideoSettings(
      streamSetupType,
      twitchManagesEncoding,
      result.outputs.map(output => output.measurement),
    );
    const expectedEncoder = twitchManagesEncoding
      ? null
      : (outputRecommendation!.encoder!.family as EEncoderFamily);
    const displaysToApply = Array.from(
      new Set(
        result.outputs.flatMap(output =>
          output.display === 'both'
            ? (['horizontal', 'vertical'] as TDisplayType[])
            : [output.display as TDisplayType],
        ),
      ),
    );

    try {
      if (
        applyVideoSettings &&
        displaysToApply.some(display => !this.dependencies.videoSettings.contexts[display])
      ) {
        throw new Error('A required video context is unavailable');
      }

      if (!twitchManagesEncoding) {
        // In Simple mode, a preset can be hidden while UseAdvanced is off, even
        // for the selected encoder. Save that preset before enabling or changing
        // its encoder settings. Advanced mode exposes one shared encoder form,
        // which is already captured by the rollback snapshot.
        if (shouldCaptureTargetPresetForRollback(snapshot.output.mode)) {
          snapshot.targetPreset = this.captureTargetEncoderPresetSnapshot(
            snapshot.output.mode,
            outputRecommendation!.encoder!.id,
            outputRecommendation!.encoder!.family as EEncoderFamily,
          );
        } else {
          this.activateEncoderPresetContext(
            snapshot.output.mode,
            outputRecommendation!.encoder!.id,
            outputRecommendation!.encoder!.family as EEncoderFamily,
          );
        }
        this.dependencies.outputSettings.setSettings({
          streaming: {
            bitrate: outputRecommendation!.bitrate,
            encoder: expectedEncoder!,
            encoderId: outputRecommendation!.encoder!.id,
            preset: outputRecommendation!.encoder!.preset,
          },
        });
      }

      if (applyVideoSettings) {
        // OSN tests temporary mixes and does not change saved video settings.
        // Only this user-approved step may grow Base (Canvas) Resolution. Each
        // display may use a different output resolution, but both share one
        // frame rate.
        const patches = buildAutoOptimizerVideoSettingsPatches(
          result.outputs,
          {
            horizontal: this.dependencies.videoSettings.state.horizontal,
            vertical: this.dependencies.videoSettings.state.vertical,
          },
          primary.fpsNum,
          primary.fpsDen,
        );
        await this.dependencies.videoSettings.applyAutoOptimizerSettings(patches);
      }

      this.verifyAppliedSettings(
        result,
        primary,
        outputRecommendation,
        applyVideoSettings,
        expectedEncoder,
        snapshot,
      );
      return {
        schemaVersion: 1,
        streamSetup: streamSetupType,
        outputs: cloneDeep(result.outputs),
      };
    } catch (error: unknown) {
      let fullyRestored = false;
      try {
        await this.restoreSettingsSnapshot(snapshot);
        fullyRestored = this.matchesSettingsSnapshot(snapshot);
      } catch (restoreError: unknown) {
        console.error('[Auto Optimizer] Failed to restore Output settings', restoreError);
      }
      if (!fullyRestored) {
        throw new Error('Auto Optimizer failed and could not fully restore previous settings');
      }
      throw error;
    }
  }

  private captureSettingsSnapshot(): ISettingsSnapshot {
    const rawOutputFormData = cloneDeep(this.dependencies.settings.state.Output.formData);
    return {
      output: cloneDeep(this.dependencies.outputSettings.getSettings()),
      rawOutputFormData,
      rawOutputValues: captureRawOutputValues(rawOutputFormData),
      horizontalVideo: cloneDeep(this.dependencies.videoSettings.state.horizontal),
      verticalVideo: cloneDeep(this.dependencies.videoSettings.state.vertical),
      liveVideoDisplays: (['horizontal', 'vertical'] as TDisplayType[]).filter(
        display => !!this.dependencies.videoSettings.contexts[display],
      ),
    };
  }

  private async restoreSettingsSnapshot(snapshot: ISettingsSnapshot): Promise<void> {
    if (snapshot.targetPreset) {
      this.activateTargetEncoderPreset(snapshot.targetPreset);
      this.setRawOutputField('Streaming', snapshot.targetPreset.field, snapshot.targetPreset.value);
    }
    this.restoreRawOutputForm(snapshot.rawOutputFormData);
    await this.dependencies.videoSettings.applyAutoOptimizerSettings({
      horizontal: snapshot.horizontalVideo,
      vertical: snapshot.verticalVideo,
    });
  }

  private matchesSettingsSnapshot(snapshot: ISettingsSnapshot): boolean {
    const actualTargetPreset = snapshot.targetPreset
      ? this.readDormantTargetPreset(snapshot.targetPreset)
      : null;
    return (
      isEqual(this.dependencies.outputSettings.getSettings(), snapshot.output) &&
      outputTransactionValuesMatch(
        snapshot.rawOutputValues,
        this.dependencies.settings.state.Output.formData,
        snapshot.targetPreset ? snapshot.targetPreset.value : null,
        actualTargetPreset,
      ) &&
      isEqual(this.dependencies.videoSettings.state.horizontal, snapshot.horizontalVideo) &&
      isEqual(this.dependencies.videoSettings.state.vertical, snapshot.verticalVideo) &&
      snapshot.liveVideoDisplays.every(display =>
        this.obsVideoMatches(
          display === 'horizontal' ? snapshot.horizontalVideo : snapshot.verticalVideo,
          display,
        ),
      )
    );
  }

  private captureTargetEncoderPresetSnapshot(
    mode: IOutputSettings['mode'],
    encoderId: string,
    encoderFamily: EEncoderFamily,
  ): ITargetEncoderPresetSnapshot {
    const field = this.dependencies.encoderQuery.resolveStreamingEncoderPreset(mode, encoderId);
    if (!field) throw new Error(`No preset field is available for encoder ${encoderId}`);

    const target: ITargetEncoderPresetSnapshot = {
      mode,
      encoderId,
      encoderFamily,
      field,
      value: '',
    };
    this.activateEncoderPresetContext(mode, encoderId, encoderFamily);
    const value = this.readRawOutputField('Streaming', field);
    if (typeof value !== 'string') {
      throw new Error(`Could not read the current preset for encoder ${encoderId}`);
    }
    target.value = value;
    return target;
  }

  private activateTargetEncoderPreset(target: ITargetEncoderPresetSnapshot) {
    this.activateEncoderPresetContext(target.mode, target.encoderId, target.encoderFamily);
  }

  private activateEncoderPresetContext(
    mode: IOutputSettings['mode'],
    encoderId: string,
    encoderFamily: EEncoderFamily,
  ) {
    if (this.dependencies.outputSettings.getSettings().mode !== mode) {
      throw new Error('Output mode changed during Auto Optimizer apply');
    }
    this.dependencies.outputSettings.setSettings({
      streaming: {
        encoder: encoderFamily,
        encoderId,
      },
    });
    if (mode === 'Simple') {
      const useAdvanced = this.readRawOutputField('Streaming', 'UseAdvanced');
      if (useAdvanced !== true) this.setRawOutputField('Streaming', 'UseAdvanced', true);
    }
    if (this.dependencies.outputSettings.getSettings().streaming.encoderId !== encoderId) {
      throw new Error(`Could not activate encoder ${encoderId}`);
    }
  }

  private readDormantTargetPreset(target: ITargetEncoderPresetSnapshot): string | null {
    // Target snapshots are intentionally Simple-only: these are distinct
    // config keys and remain meaningful after the original encoder is restored.
    const activeFormData = cloneDeep(this.dependencies.settings.state.Output.formData);
    try {
      this.activateTargetEncoderPreset(target);
      const value = this.readRawOutputField('Streaming', target.field);
      return typeof value === 'string' ? value : null;
    } finally {
      // Dormant verification must not leave the target encoder selected.
      this.restoreRawOutputForm(activeFormData);
    }
  }

  private restoreRawOutputForm(formData: ISettingsSubCategory[]) {
    // The first Advanced-mode save switches the encoder. OBS intentionally
    // discards encoder-property values from that same save and creates the
    // selected encoder with defaults. The second save restores those values
    // now that the original encoder is active. This is harmless in Simple mode.
    this.dependencies.settings.setSettings('Output', cloneDeep(formData));
    this.dependencies.settings.setSettings('Output', cloneDeep(formData));
  }

  private readRawOutputField(subCategory: string, field: string): unknown {
    return this.dependencies.settings.findSettingValue(
      this.dependencies.settings.state.Output.formData,
      subCategory,
      field,
    );
  }

  private setRawOutputField(subCategory: string, field: string, value: string | boolean) {
    const formData = cloneDeep(this.dependencies.settings.state.Output.formData);
    const setting = this.dependencies.settings.findSetting(formData, subCategory, field);
    if (!setting) throw new Error(`Output setting ${subCategory}.${field} is unavailable`);
    setting.value = value;
    this.dependencies.settings.setSettings('Output', formData);
  }

  private obsVideoMatches(expected: ISettingsSnapshot['horizontalVideo'], display: TDisplayType) {
    const actual = this.dependencies.videoSettings.contexts[display]?.video;
    if (!actual) return false;
    return (
      actual.baseWidth === expected.baseWidth &&
      actual.baseHeight === expected.baseHeight &&
      actual.outputWidth === expected.outputWidth &&
      actual.outputHeight === expected.outputHeight &&
      actual.fpsNum === expected.fpsNum &&
      actual.fpsDen === expected.fpsDen
    );
  }

  private verifyAppliedSettings(
    result: IAutoOptimizerResult,
    primary: IAutoOptimizerOutputResult,
    outputRecommendation: IAutoOptimizerOutputResult | null,
    applyVideoSettings: boolean,
    expectedEncoder: EEncoderFamily | null,
    snapshot: ISettingsSnapshot,
  ) {
    const outputSettings = this.dependencies.outputSettings.getSettings();
    if (outputRecommendation && outputSettings.streaming.bitrate !== outputRecommendation.bitrate) {
      throw new Error('Failed to apply the recommended bitrate');
    }
    if (outputRecommendation && outputSettings.streaming.encoder !== expectedEncoder) {
      throw new Error('Failed to apply the recommended encoder');
    }
    if (
      outputRecommendation &&
      outputSettings.streaming.encoderId !== outputRecommendation.encoder!.id
    ) {
      throw new Error('Failed to apply the tested encoder implementation');
    }
    if (outputRecommendation) {
      const presetField = this.dependencies.encoderQuery.resolveStreamingEncoderPreset(
        outputSettings.mode,
        outputRecommendation.encoder!.id,
      );
      const rawPreset = presetField ? this.readRawOutputField('Streaming', presetField) : null;
      let appliedPreset: string;
      try {
        if (typeof rawPreset !== 'string' || !rawPreset) throw new Error('Missing preset');
        appliedPreset = encoderPresetFromSettingsValue(
          outputRecommendation.encoder!.id,
          outputSettings.mode,
          rawPreset,
        );
      } catch (error: unknown) {
        throw new Error('Failed to read the recommended encoder preset');
      }
      if (appliedPreset !== outputRecommendation.encoder!.preset) {
        throw new Error('Failed to apply the recommended encoder preset');
      }
      if (
        outputSettings.mode === 'Simple' &&
        this.readRawOutputField('Streaming', 'UseAdvanced') !== true
      ) {
        throw new Error('Failed to enable the recommended encoder preset');
      }
    }

    if (!applyVideoSettings) return;

    (['horizontal', 'vertical'] as TDisplayType[]).forEach(display => {
      const state = this.dependencies.videoSettings.state[display];
      if (state && (state.fpsNum !== primary.fpsNum || state.fpsDen !== primary.fpsDen)) {
        throw new Error(`Failed to persist the recommended ${display} frame rate`);
      }
      const live = this.dependencies.videoSettings.contexts[display]?.video;
      if (live && (live.fpsNum !== primary.fpsNum || live.fpsDen !== primary.fpsDen)) {
        throw new Error(`Failed to apply the recommended ${display} frame rate`);
      }
    });
    result.outputs
      .flatMap(output => [
        {
          display: (output.display === 'vertical' ? 'vertical' : 'horizontal') as TDisplayType,
          resolution: output.resolution,
        },
        ...(output.additionalVideo
          ? [
              {
                display: output.additionalVideo.display,
                resolution: output.additionalVideo.resolution,
              },
            ]
          : []),
      ])
      .forEach(({ display, resolution }) => {
        const state = this.dependencies.videoSettings.state[display];
        const video = this.dependencies.videoSettings.contexts[display]?.video;
        const previous = display === 'vertical' ? snapshot.verticalVideo : snapshot.horizontalVideo;
        const promotedResolution = autoOptimizerPromotesResolution(
          previous.outputWidth,
          previous.outputHeight,
          resolution.width,
          resolution.height,
        );
        if (!state || !video) throw new Error(`The ${display} video context is unavailable`);
        if (
          state.outputWidth !== resolution.width ||
          state.outputHeight !== resolution.height ||
          (promotedResolution && state.baseWidth < resolution.width) ||
          (promotedResolution && state.baseHeight < resolution.height) ||
          video.baseWidth !== state.baseWidth ||
          video.baseHeight !== state.baseHeight ||
          video.outputWidth !== resolution.width ||
          video.outputHeight !== resolution.height
        ) {
          throw new Error(`Failed to apply the recommended ${display} video settings`);
        }
      });
  }
}
