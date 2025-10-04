import fs from 'fs-extra';
import { IResolution, SvgCreator } from '../subtitles/svg-creator';
import { getTranscription } from '../ai-highlighter-utils';
import { SubtitleMode } from '../subtitles/subtitle-mode';
import { IExportOptions } from '../models/rendering.models';
import path from 'path';

export const SUBTITLE_PER_SECOND = 3;

let sharp: any = null;

export async function svgToPng(svgText: string, resolution: IResolution, outputPath: string) {
  try {
    if (!sharp) {
      // Import sharp dynamically to avoid issues with the main process
      sharp = (await import('sharp')).default;
    }
  } catch (error: unknown) {
    console.error('Error importing sharp:', error);
    throw new Error('Sharp library is not available. Please ensure it is installed.');
  }
  try {
    const buffer = await sharp({
      // Generate PNG with transparent background
      create: {
        width: resolution.width,
        height: resolution.height,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .composite([
        {
          input: Buffer.from(svgText),
          top: 0,
          left: 0,
        },
      ])
      .png()
      .toBuffer();

    await fs.writeFile(outputPath, buffer);
  } catch (error: unknown) {
    console.error('Error creating PNG from SVG', error);
    throw new Error('Failed to create PNG from SVG');
  }
}

export async function createSubtitles(
  mediaPath: string,
  userId: string,
  parsed: path.ParsedPath,
  exportOptions: IExportOptions,
  totalDuration: number,
  totalFrames: number,
) {
  const subtitleDirectory = path.join(parsed.dir, 'temp_subtitles');

  if (!fs.existsSync(subtitleDirectory)) {
    fs.mkdirSync(subtitleDirectory, { recursive: true });
  }

  const exportResolution = exportOptions.complexFilter
    ? { width: exportOptions.height, height: exportOptions.width }
    : { width: exportOptions.width, height: exportOptions.height };
  const svgCreator = new SvgCreator(exportResolution, exportOptions.subtitleStyle);

  const transcription = await getTranscription(mediaPath, userId, totalDuration);

  const subtitleClips = transcription.generateSubtitleClips(
    SubtitleMode.static,
    exportOptions.width / exportOptions.height,
    20,
  );
  // Create subtitles
  let subtitleCounter = 0;

  const subtitleEveryNFrames = Math.floor(exportOptions.fps / SUBTITLE_PER_SECOND);

  const subtitlesToProcess = [];
  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += subtitleEveryNFrames) {
    // Find the appropriate subtitle clip for this frame
    const timeInSeconds = frameIndex / exportOptions.fps;
    const subtitleClip = subtitleClips.clips.find(
      clip => timeInSeconds >= clip.startTimeInEdit && timeInSeconds <= clip.endTimeInEdit,
    );

    if (subtitleClip) {
      subtitlesToProcess.push(subtitleClip.text);
    } else {
      subtitlesToProcess.push('');
    }
  }

  for (const subtitleText of subtitlesToProcess) {
    const svgString = svgCreator.getSvgWithText([subtitleText], 0);
    const pngPath = path.join(
      subtitleDirectory,
      `/subtitles_${String(subtitleCounter).padStart(4, '0')}.png`,
    );
    await svgToPng(svgString, exportResolution, pngPath);
    subtitleCounter++;
  }
  return subtitleDirectory;
}

export function cleanupSubtitleDirectory(directory: string) {
  if (directory) {
    try {
      fs.removeSync(directory);
    } catch (error: unknown) {
      console.error('Failed to clean up subtitle directory', error);
    }
  }
}
