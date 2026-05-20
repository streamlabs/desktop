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

    // Normalize each input to 48000 Hz stereo before mixing.
    // amix requires all inputs to have matching sample rates and channel layouts.
    // The concat FLAC is already at 48000 Hz (forced in AudioSource.extract), but
    // user-provided music files (mp3/wav) are commonly at 44100 Hz which causes amix to fail.
    const normalizedLabels = this.inputs.map((_, index) => `[norm${index}]`);
    const normFilters = this.inputs
      .map(
        (_, index) =>
          `[${index}:a]aresample=48000,aformat=sample_fmts=s32:channel_layouts=stereo${normalizedLabels[index]}`,
      )
      .join(';');

    const mixFilter = `${normalizedLabels.join('')}amix=inputs=${
      this.inputs.length
    }:duration=first:weights=${this.inputs.map(i => i.volume).join(':')}`;

    const filterGraph = `${normFilters};${mixFilter}`;

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
