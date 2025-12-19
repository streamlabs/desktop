import path from 'path';
import {
  AVAILABLE_TRANSITIONS,
  EExportStep,
  IAudioInfo,
  IExportInfo,
  IExportOptions,
  ITransitionInfo,
  transitionParams,
} from '../models/rendering.models';
import { AudioCrossfader } from './audio-crossfader';
import { AudioMixer } from './audio-mixer';
import { RenderingClip } from './rendering-clip';
import { Transitioner } from './transitioner';
import { FrameWriter } from './frame-writer';
import { HighlighterError } from './errors';
import { $t } from '../../i18n';
import * as Sentry from '@sentry/browser';
import { sample } from 'lodash';
import { TAnalyticsEvent } from '../../usage-statistics';

export interface IRenderingConfig {
  renderingClips: RenderingClip[];
  isPreview: boolean;
  exportInfo: IExportInfo;
  exportOptions: IExportOptions;
  audioInfo: IAudioInfo;
  transitionDuration: number;
  transition: ITransitionInfo;
  useAiHighlighter: boolean;
  streamId: string | undefined;
}
export async function startRendering(
  renderingConfig: IRenderingConfig,
  handleFrame: (currentFrame: number) => void,
  setExportInfo: (partialExportInfo: Partial<IExportInfo>) => void,
  recordAnalyticsEvent: (type: TAnalyticsEvent, data: Record<string, unknown>) => void,
) {
  const renderingClips = renderingConfig.renderingClips;
  const isPreview = renderingConfig.isPreview;
  const exportInfo = renderingConfig.exportInfo;
  const exportOptions = renderingConfig.exportOptions;
  const audioInfo = renderingConfig.audioInfo;
  const transitionDuration = renderingConfig.transitionDuration;
  const transition = renderingConfig.transition;
  const useAiHighlighter = renderingConfig.useAiHighlighter;
  const streamId = renderingConfig.streamId;

  let fader: AudioCrossfader | null = null;
  let mixer: AudioMixer | null = null;
  try {
    // Estimate the total number of frames to set up export info
    const totalFrames = renderingClips.reduce((count: number, clip) => {
      return count + clip.frameSource.nFrames;
    }, 0);
    const numTransitions = renderingClips.length - 1;
    const transitionFrames = transitionDuration * exportOptions.fps;
    const totalFramesAfterTransitions = totalFrames - numTransitions * transitionFrames;

    setExportInfo({
      totalFrames: totalFramesAfterTransitions,
    });

    let currentFrame = 0;

    // Mix audio first
    await Promise.all(
      renderingClips.filter(c => c.hasAudio).map(clip => clip.audioSource.extract()),
    );
    const parsed = path.parse(exportInfo.file);
    const audioConcat = path.join(parsed.dir, `${parsed.name}-concat.flac`);
    let audioMix = path.join(parsed.dir, `${parsed.name}-mix.flac`);
    fader = new AudioCrossfader(audioConcat, renderingClips, transitionDuration);
    await fader.export();

    if (audioInfo.musicEnabled && audioInfo.musicPath) {
      mixer = new AudioMixer(audioMix, [
        { path: audioConcat, volume: 1, loop: false },
        {
          path: audioInfo.musicPath,
          volume: Math.pow(10, -1 + audioInfo.musicVolume / 100),
          loop: true,
        },
      ]);

      await mixer.export();
    } else {
      // If there's no background music, we can skip mix entirely and just
      // use the concatenated clip audio directly.
      audioMix = audioConcat;
    }

    await Promise.all(renderingClips.map(clip => clip.audioSource.cleanup()));
    const nClips = renderingClips.length;

    setExportInfo({ step: EExportStep.FrameRender });

    // Cannot be null because we already checked there is at least 1 element in the array
    let fromClip = renderingClips.shift()!;
    let toClip = renderingClips.shift();

    let transitioner: Transitioner | null = null;
    const exportPath = isPreview ? exportInfo.previewFile : exportInfo.file;
    const writer = new FrameWriter(
      exportPath,
      audioMix,
      totalFramesAfterTransitions / exportOptions.fps,
      exportOptions,
    );

    while (true) {
      if (exportInfo.cancelRequested) {
        if (fromClip) fromClip.frameSource.end();
        if (toClip) toClip.frameSource.end();
        await writer.end();
        break;
      }

      const fromFrameRead = await fromClip.frameSource.readNextFrame();

      // Sometimes we get one less frame than we expect.
      // When this happens, we just pad in an extra frame that is
      // the same as the previous frame
      if (!fromFrameRead && fromClip.frameSource.currentFrame < fromClip.frameSource.nFrames) {
        // The read buffer should still be valid, so just increment the counter
        console.debug('Padding with repeated frame');
        fromClip.frameSource.currentFrame++;
      }

      const actualTransitionFrames = Math.min(
        transitionFrames,
        (fromClip.frameSource.trimmedDuration / 2) * exportOptions.fps,
        toClip ? (toClip.frameSource.trimmedDuration / 2) * exportOptions.fps : Infinity,
      );

      const inTransition =
        fromClip.frameSource.currentFrame > fromClip.frameSource.nFrames - actualTransitionFrames;
      let frameToRender: Buffer | null;

      if (inTransition && toClip && actualTransitionFrames !== 0) {
        await toClip.frameSource.readNextFrame();

        if (!transitioner) {
          if (transition.type === 'Random') {
            const type = sample(
              AVAILABLE_TRANSITIONS.filter(t => !['None', 'Random'].includes(t.type)),
            )!.type;
            transitioner = new Transitioner(type, transitionParams[type], exportOptions);
          } else {
            transitioner = new Transitioner(
              transition.type,
              transitionParams[transition.type],
              exportOptions,
            );
          }
        }

        transitioner.renderTransition(
          fromClip.frameSource.readBuffer,
          toClip.frameSource.readBuffer,

          // Frame counter refers to next frame we will read
          // Subtract 1 to get the frame we just read
          (toClip.frameSource.currentFrame - 1) / actualTransitionFrames,
        );
        frameToRender = transitioner.getFrame();
      } else {
        frameToRender = fromClip.frameSource.readBuffer;
      }

      // Write the next frame
      if (frameToRender) {
        await writer.writeNextFrame(frameToRender);
        currentFrame++;
        handleFrame(currentFrame);
      }

      // Check if the currently playing clip ended
      if (fromClip.frameSource.currentFrame === fromClip.frameSource.nFrames || !frameToRender) {
        // Reset the transitioner so a new one is selected at random
        if (transition.type === 'Random') transitioner = null;
        fromClip.frameSource.end();
        fromClip = toClip!;
        toClip = renderingClips.shift();
      }

      if (!fromClip) {
        console.log('Out of sources, closing file');
        await writer.end();
        console.debug(
          `Export complete - Expected Frames: ${exportInfo.totalFrames} Actual Frames: ${currentFrame}`,
        );

        recordAnalyticsEvent(useAiHighlighter ? 'AIHighlighter' : 'Highlighter', {
          type: 'ExportComplete',
          numClips: nClips,
          totalClips: renderingClips.length,
          transition: transition.type,
          transitionDuration: transition.duration,
          resolution: exportInfo.resolution,
          fps: exportInfo.fps,
          preset: exportInfo.preset,
          duration: totalFramesAfterTransitions / exportOptions.fps,
          isPreview,
          streamId,
        });
        break;
      }
    }
  } catch (error: unknown) {
    console.error(error);

    Sentry.withScope(scope => {
      scope.setTag('feature', 'highlighter');
      console.error('Highlighter export error', error);
    });

    if (error instanceof HighlighterError) {
      setExportInfo({ error: error.userMessage });
      recordAnalyticsEvent(useAiHighlighter ? 'AIHighlighter' : 'Highlighter', {
        type: 'ExportError',
        error: error.constructor.name,
      });
    } else {
      setExportInfo({ error: $t('An error occurred while exporting the video') });

      recordAnalyticsEvent(useAiHighlighter ? 'AIHighlighter' : 'Highlighter', {
        type: 'ExportError',
        error: 'Unknown',
      });
    }
  } finally {
    setExportInfo({
      exporting: false,
      exported: !exportInfo.cancelRequested && !isPreview && !exportInfo.error,
    });

    if (fader) await fader.cleanup();
    if (mixer) await mixer.cleanup();
  }
}
