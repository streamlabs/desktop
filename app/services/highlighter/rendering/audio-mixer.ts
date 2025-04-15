import execa from 'execa';
import fs from 'fs';
import { FFMPEG_EXE } from '../constants';
import { AudioMixError } from './errors';

interface IAudioInput {
  path: string;
  volume: number;
  loop: boolean;
}

export class AudioMixer {
  constructor(public readonly outputPath: string, public readonly inputs: IAudioInput[]) {}

  async export() {
    const inputArgs = this.inputs.reduce((args: string[], input) => {
      return [...args, '-stream_loop', input.loop ? '-1' : '0', '-i', input.path];
    }, []);

    const args = [...inputArgs];

    const inputMap = this.inputs.map((_, index) => `[${index}:a]`).join('');

    const filterGraph = `${inputMap}amix=inputs=${
      this.inputs.length
    }:duration=first:weights=${this.inputs.map(i => i.volume).join(' ')}`;

    args.push('-filter_complex', filterGraph);

    args.push('-c:a', 'flac', '-y', this.outputPath);

    try {
      await execa(FFMPEG_EXE, args);
    } catch (e: unknown) {
      console.error('Highlighter audio mix error', e);
      throw new AudioMixError();
    }
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
