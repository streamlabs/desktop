import execa from 'execa';
import { IExportOptions } from '../models/rendering.models';
import { FADE_OUT_DURATION, FFMPEG_EXE } from '../constants';
import { FrameWriteError } from './errors';
import fs from 'fs-extra';
import path from 'path';
import { SUBTITLE_PER_SECOND } from './render-subtitle';

export class FrameWriter {
  constructor(
    public readonly outputPath: string,
    public readonly audioInput: string,
    public readonly duration: number,
    public readonly options: IExportOptions,
    public readonly subtitleDirectory: string | null,
  ) {}

  private ffmpeg: execa.ExecaChildProcess<Buffer | string>;

  exitPromise: Promise<void>;

  private async startFfmpeg() {
    /* eslint-disable */
    const args = [
      // Video Input
      '-f',
      'rawvideo',
      '-vcodec',
      'rawvideo',
      '-pix_fmt',
      'rgba',
      '-s',
      `${this.options.width}x${this.options.height}`,
      '-r',
      `${this.options.fps}`,
      '-i',
      '-',

      // Audio Input

      // Input Mapping
      // '-map',
      // '0:v:0',
    ];
    if (this.options.subtitleStyle && this.subtitleDirectory) {
      await this.addSubtitleInput(args, this.subtitleDirectory);
    }
    this.addAudioFilters(args, !!this.options.subtitleStyle);
    this.addVideoFilters(args, !!this.options.subtitleStyle);

    const crf = this.options.preset === 'slow' ? '18' : '21';

    args.push(
      ...[
        // Video Output
        '-vcodec',
        'libx264',
        '-profile:v',
        'high',
        '-preset:v',
        this.options.preset,
        '-crf',
        `${crf}`,
        '-movflags',
        'faststart',

        // Audio Output
        '-acodec',
        'aac',
        '-b:a',
        '128k',

        '-y',
        this.outputPath,
      ],
    );

    /* eslint-enable */
    this.ffmpeg = execa(FFMPEG_EXE, args, {
      encoding: null,
      buffer: false,
      stdin: 'pipe',
      stdout: process.stdout,
      stderr: 'pipe',
    });

    this.exitPromise = new Promise<void>(resolve => {
      this.ffmpeg.on('exit', code => {
        console.log('ffmpeg writer exited with code', code);
        resolve();
      });
    });

    this.ffmpeg.catch(e => {
      console.log('ffmpeg:', e);
    });

    this.ffmpeg.stderr?.on('data', (data: Buffer) => {
      console.log('ffmpeg:', data.toString());
    });
  }
  private addVideoFilters(args: string[], subtitlesEnabled = false) {
    const webcamEnabled = !!this.options.complexFilter;

    const firstInput = webcamEnabled ? '[final]' : '[0:v]';
    const output = subtitlesEnabled ? '[subtitled]' : '[final]';

    const fadeFilter = `format=yuv420p,fade=type=out:duration=${FADE_OUT_DURATION}:start_time=${Math.max(
      this.duration - (FADE_OUT_DURATION + 0.2),
      0,
    )}`;
    args.push('-filter_complex');

    if (!webcamEnabled && !subtitlesEnabled) {
      args.push(fadeFilter);
      return;
    }

    let combinedFilter = '';
    if (webcamEnabled) {
      combinedFilter += this.options.complexFilter;
    }

    if (subtitlesEnabled) {
      combinedFilter += `${firstInput}[1:v]overlay=0:0[subtitled];`;
    }

    combinedFilter += output + fadeFilter;
    args.push(combinedFilter);
  }

  private addAudioFilters(args: string[], subtitlesEnabled = false) {
    args.push(
      '-i',
      this.audioInput,
      '-map',
      subtitlesEnabled ? '2:a:0' : '1:a:0',
      '-af',
      `afade=type=out:duration=${FADE_OUT_DURATION}:start_time=${Math.max(
        this.duration - (FADE_OUT_DURATION + 0.2),
        0,
      )}`,
    );
  }
  private async addSubtitleInput(args: string[], subtitleDirectory: string) {
    args.push(
      '-framerate',
      String(SUBTITLE_PER_SECOND),
      '-i',
      `${subtitleDirectory}\\subtitles_%04d.png`,
    );
  }

  async writeNextFrame(frameBuffer: Buffer) {
    if (!this.ffmpeg) await this.startFfmpeg();

    try {
      await new Promise<void>((resolve, reject) => {
        this.ffmpeg.stdin?.write(frameBuffer, e => {
          if (e) {
            reject();
            return;
          }
          resolve();
        });
      });
    } catch (e: unknown) {
      throw new FrameWriteError();
    }
  }

  end() {
    this.ffmpeg?.stdin?.end();
    return this.exitPromise;
  }
}
