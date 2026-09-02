import {
  autoOptimizerAcceptedBaseResolution,
  autoOptimizerPromotesResolution,
} from './resolution-policy';
import { IAutoOptimizerOutputResult } from './types';
import { AUTO_OPTIMIZER_MAX_RECOMMENDED_BITRATE_KBPS } from './bitrate-policy';

export interface IOutputFormParameterLike {
  name: string;
  value?: unknown;
}

export interface IOutputFormGroupLike {
  nameSubCategory: string;
  parameters: IOutputFormParameterLike[];
}

export type TRawOutputValues = Record<string, unknown>;

/**
 * Twitch selects bitrate and encoder settings for Enhanced Broadcasting.
 * Desktop may apply resolution and shared frame rate only after an active
 * workload test validates them; estimated Enhanced Broadcasting results do not
 * change video settings.
 */
export function shouldApplyAutoOptimizerVideoSettings(
  streamSetup: string,
  providerOwnsEncoding: boolean,
  measurementModes: string[],
): boolean {
  return (
    !providerOwnsEncoding ||
    (streamSetup === 'enhanced-broadcasting' &&
      measurementModes.length > 0 &&
      measurementModes.every(mode => mode === 'active'))
  );
}

/**
 * All standard streaming instances share one encoder and bitrate configuration.
 * Apply a standard recommendation only when every standard output returns the
 * same settings. Ignore Twitch Enhanced Broadcasting outputs because Twitch
 * configures them.
 */
export function selectAutoOptimizerStandardOutputRecommendation(
  outputs: IAutoOptimizerOutputResult[],
): IAutoOptimizerOutputResult | null {
  const standardOutputs = outputs.filter(output => output.outputKind === 'standard');
  if (!standardOutputs.length) return null;
  if (standardOutputs.some(output => !output.encoder)) {
    throw new Error('The optimizer did not return a tested encoder');
  }
  if (
    standardOutputs.some(
      output => output.bitrate < 1 || output.bitrate > AUTO_OPTIMIZER_MAX_RECOMMENDED_BITRATE_KBPS,
    )
  ) {
    throw new Error('The optimizer returned an unsupported streaming bitrate');
  }
  const encoderSignatures = new Set(
    standardOutputs.map(
      output => `${output.encoder!.id}:${output.encoder!.family}:${output.encoder!.preset || ''}`,
    ),
  );
  const bitrates = new Set(standardOutputs.map(output => output.bitrate));
  if (encoderSignatures.size !== 1 || bitrates.size !== 1) {
    throw new Error('This stream topology cannot apply different standard output settings');
  }
  return standardOutputs[0];
}

interface IAutoOptimizerVideoSettingsLike {
  baseWidth: number;
  baseHeight: number;
  outputWidth: number;
  outputHeight: number;
  fpsNum: number;
  fpsDen: number;
}

interface IAutoOptimizerVideoResultLike {
  display: 'horizontal' | 'vertical' | 'both';
  resolution: { width: number; height: number };
  additionalVideo?: {
    display: 'vertical';
    resolution: { width: number; height: number };
  };
}

export type TAutoOptimizerVideoPatches = Partial<
  Record<'horizontal' | 'vertical', Partial<IAutoOptimizerVideoSettingsLike>>
>;

/** Build the atomic video update; bitrate and encoder changes are handled separately. */
export function buildAutoOptimizerVideoSettingsPatches(
  outputs: IAutoOptimizerVideoResultLike[],
  current: Partial<Record<'horizontal' | 'vertical', IAutoOptimizerVideoSettingsLike>>,
  fpsNum: number,
  fpsDen: number,
): TAutoOptimizerVideoPatches {
  const patches: TAutoOptimizerVideoPatches = {};
  const addResolutionPatch = (
    display: 'horizontal' | 'vertical',
    resolution: { width: number; height: number },
  ) => {
    const video = current[display];
    if (!video) return;
    const promotesResolution = autoOptimizerPromotesResolution(
      video.outputWidth,
      video.outputHeight,
      resolution.width,
      resolution.height,
    );
    const base = promotesResolution
      ? autoOptimizerAcceptedBaseResolution(
          video.baseWidth,
          video.baseHeight,
          resolution.width,
          resolution.height,
        )
      : { width: video.baseWidth, height: video.baseHeight };
    patches[display] = {
      baseWidth: base.width,
      baseHeight: base.height,
      outputWidth: resolution.width,
      outputHeight: resolution.height,
    };
  };
  outputs.forEach(output => {
    if (output.display === 'both') {
      if (!output.additionalVideo || output.additionalVideo.display !== 'vertical') {
        throw new Error('A paired vertical recommendation is required for Dual Stream');
      }
      addResolutionPatch('horizontal', output.resolution);
      addResolutionPatch('vertical', output.additionalVideo.resolution);
      return;
    }
    addResolutionPatch(output.display, output.resolution);
  });
  (['horizontal', 'vertical'] as const).forEach(display => {
    if (!current[display]) return;
    patches[display] = { ...patches[display], fpsNum, fpsDen };
  });
  return patches;
}

/** Simple mode can hide the selected encoder's preset when UseAdvanced is off. */
export function shouldCaptureTargetPresetForRollback(mode: 'Simple' | 'Advanced'): boolean {
  return mode === 'Simple';
}

function fieldKey(group: string, name: string): string {
  return `${group}\u0000${name}`;
}

/** Snapshot every raw value exposed by the active Output configuration. */
export function captureRawOutputValues(formData: IOutputFormGroupLike[]): TRawOutputValues {
  const values: TRawOutputValues = {};
  formData.forEach(group => {
    group.parameters.forEach(parameter => {
      values[fieldKey(group.nameSubCategory, parameter.name)] = parameter.value;
    });
  });
  return values;
}

/** Compare raw values, including fields omitted from the high-level settings model. */
export function rawOutputValuesMatch(
  expected: TRawOutputValues,
  formData: IOutputFormGroupLike[],
): boolean {
  const actual = captureRawOutputValues(formData);
  const expectedKeys = Object.keys(expected);
  const actualKeys = Object.keys(actual);
  if (expectedKeys.length !== actualKeys.length) return false;
  return expectedKeys.every(
    key => Object.prototype.hasOwnProperty.call(actual, key) && actual[key] === expected[key],
  );
}

/** Include the target encoder's normally dormant preset in rollback verification. */
export function outputTransactionValuesMatch(
  expectedActive: TRawOutputValues,
  activeFormData: IOutputFormGroupLike[],
  expectedTargetPreset: string | null,
  actualTargetPreset: string | null,
): boolean {
  return (
    rawOutputValuesMatch(expectedActive, activeFormData) &&
    expectedTargetPreset === actualTargetPreset
  );
}
