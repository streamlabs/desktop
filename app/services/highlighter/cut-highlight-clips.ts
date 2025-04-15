import fs from 'fs-extra';
import execa from 'execa';
import { IHighlightedStream, INewClipData } from './models/highlighter.models';
import { FFMPEG_EXE, FFPROBE_EXE } from './constants';
import { IHighlight } from './models/ai-highlighter.models';
import path from 'path';

export async function getVideoDuration(filePath: string): Promise<number> {
  const { stdout } = await execa(FFPROBE_EXE, [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  const duration = parseFloat(stdout);
  return duration;
}

export async function cutHighlightClips(
  videoUri: string,
  highlighterData: IHighlight[],
  streamInfo: IHighlightedStream,
): Promise<INewClipData[]> {
  const id = streamInfo.id;
  const fallbackTitle = 'awesome-stream';
  const videoDir = path.dirname(videoUri);
  const filename = path.basename(videoUri);
  const sanitizedTitle = streamInfo.title
    ? streamInfo.title.replace(/[\\/:"*?<>|]+/g, ' ')
    : fallbackTitle;
  const folderName = `${filename}-Clips-${sanitizedTitle}-${id.slice(id.length - 4, id.length)}`;
  const outputDir = path.join(videoDir, folderName);

  // Check if directory for clips exists, if not create it
  try {
    try {
      await fs.readdir(outputDir);
    } catch (error: unknown) {
      await fs.mkdir(outputDir);
    }
  } catch (error: unknown) {
    console.error('Error creating file directory');
    return [];
  }

  const sortedHighlights = highlighterData.sort((a, b) => a.start_time - b.start_time);
  const results: INewClipData[] = [];
  const processedFiles = new Set<string>();

  const duration = await getVideoDuration(videoUri);

  // First check the codec
  const probeArgs = [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=codec_name,format=duration',
    '-of',
    'default=nokey=1:noprint_wrappers=1',
    videoUri,
  ];
  let codec = '';
  try {
    const codecResult = await execa(FFPROBE_EXE, probeArgs);
    codec = codecResult.stdout.trim();
    console.log(`Codec for ${videoUri}: ${codec}`);
  } catch (error: unknown) {
    console.error(`Error checking codec for ${videoUri}:`, error);
  }
  console.time('export');
  const BATCH_SIZE = 1;
  const DEFAULT_START_TRIM = 10;
  const DEFAULT_END_TRIM = 10;

  for (let i = 0; i < sortedHighlights.length; i += BATCH_SIZE) {
    const highlightBatch = sortedHighlights.slice(i, i + BATCH_SIZE);
    const batchTasks = highlightBatch.map((highlight: IHighlight) => {
      return async () => {
        const formattedStart = highlight.start_time.toString().padStart(6, '0');
        const formattedEnd = highlight.end_time.toString().padStart(6, '0');
        const outputFilename = `${folderName}-${formattedStart}-${formattedEnd}.mp4`;
        const outputUri = path.join(outputDir, outputFilename);

        if (processedFiles.has(outputUri)) {
          console.log('File already exists');
          return null;
        }
        processedFiles.add(outputUri);

        // Check if the file with that name already exists and delete it if it does
        try {
          await fs.access(outputUri);
          await fs.unlink(outputUri);
        } catch (err: unknown) {
          if ((err as any).code !== 'ENOENT') {
            console.error(`Error checking existence of ${outputUri}:`, err);
          }
        }

        // Calculate new start and end times + new clip duration
        const newClipStartTime = Math.max(0, highlight.start_time - DEFAULT_START_TRIM);
        const actualStartTrim = highlight.start_time - newClipStartTime;
        const newClipEndTime = Math.min(duration, highlight.end_time + DEFAULT_END_TRIM);
        const actualEndTrim = newClipEndTime - highlight.end_time;

        const args = [
          '-ss',
          newClipStartTime.toString(),
          '-to',
          newClipEndTime.toString(),
          '-i',
          videoUri,
          '-c:v',
          codec === 'h264' ? 'copy' : 'libx264',
          '-c:a',
          'aac',
          '-strict',
          'experimental',
          '-b:a',
          '192k',
          '-movflags',
          'faststart',
          outputUri,
        ];

        try {
          const subprocess = execa(FFMPEG_EXE, args);
          const timeoutDuration = 1000 * 60 * 5;
          const timeoutId = setTimeout(() => {
            console.warn(`FFMPEG process timed out for ${outputUri}`);
            subprocess.kill('SIGTERM', { forceKillAfterTimeout: 2000 });
          }, timeoutDuration);

          try {
            await subprocess;
            console.log(`Created segment: ${outputUri}`);
            const newClipData: INewClipData = {
              path: outputUri,
              aiClipInfo: {
                inputs: highlight.inputs,
                score: highlight.score,
                metadata: highlight.metadata,
              },
              startTime: highlight.start_time,
              endTime: highlight.end_time,
              startTrim: actualStartTrim,
              endTrim: actualEndTrim,
            };
            return newClipData;
          } catch (error: unknown) {
            console.warn(`Error during FFMPEG execution for ${outputUri}:`, error);
            return null;
          } finally {
            clearTimeout(timeoutId);
          }
        } catch (error: unknown) {
          console.error(`Error creating segment: ${outputUri}`, error);
          return null;
        }
      };
    });

    const batchResults = await Promise.allSettled(batchTasks.map(task => task()));
    results.push(
      ...batchResults
        .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
        .map(result => result.value)
        .filter(value => value !== null),
    );

    const failedResults = batchResults.filter(result => result.status === 'rejected');

    if (failedResults.length > 0) {
      console.error('Failed exports:', failedResults);
    }
  }

  console.timeEnd('export');
  return results;
}
