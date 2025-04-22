import execa from 'execa';
import fs from 'fs';
import { FFMPEG_EXE } from '../constants';
import { RenderingClip } from './rendering-clip';
import { AudioMixError } from './errors';

export class AudioCrossfader {
  constructor(
    public readonly outputPath: string,
    public readonly clips: RenderingClip[],
    public readonly transitionDuration: number,
  ) {}

  async export() {
    const inputArgs = this.clips.reduce((args: string[], clip) => {
      if (clip.hasAudio) {
        return [...args, '-i', clip.audioSource.outPath];
      } else {
        return [
          ...args,
          '-f',
          'lavfi',
          '-t',
          clip.frameSource.trimmedDuration.toString(),
          '-i',
          'anullsrc',
        ];
      }
    }, []);

    const args = [...inputArgs];

    const filterGraph = this.getFilterGraph();

    if (filterGraph.length > 0) {
      args.push('-filter_complex', filterGraph);
    }

    args.push('-c:a', 'flac', '-y', this.outputPath);

    try {
      await execa(FFMPEG_EXE, args);
    } catch (e: unknown) {
      console.error('Highlighter audio crossfade error', e);
      throw new AudioMixError();
    }
  }

  getFilterGraph() {
    let inStream = '[0:a]';

    const filterGraph = this.clips
      .slice(0, -1)
      .map((clip, i) => {
        const outStream = `[concat${i}]`;

        const overlap = Math.min(
          this.transitionDuration,
          clip.frameSource.trimmedDuration / 2,
          this.clips[i + 1] ? this.clips[i + 1].frameSource.trimmedDuration / 2 : Infinity,
        );

        let filter: string;

        // Crossfade doesn't work with an overlap of 0, so use the concat filter instead
        if (overlap === 0) {
          filter = 'concat=v=0:a=1';
        } else {
          filter = `acrossfade=d=${overlap}:c1=tri:c2=tri`;
        }

        let ret = `${inStream}[${i + 1}:a]${filter}`;

        inStream = outStream;

        if (i < this.clips.length - 2) ret += outStream;

        return ret;
      })
      .join(',');

    return filterGraph;
  }

  async cleanup() {
    return new Promise<void>(resolve => {
      fs.unlink(this.outputPath, e => {
        if (e) {
          console.log(e);
          resolve();
          return;
        }

        resolve();
      });
    });
  }
}
