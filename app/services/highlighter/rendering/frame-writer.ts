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
    if (this.options.subtitles || true) {
      console.log('adding subtitles');
      await this.addSubtitleInput(args, this.options);
    }
    this.addAudioFilters(args);
    this.addVideoFilters(args, true); //!!this.options.subtitles

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
        '18',
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
    console.log(args.join(' '));

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
  //  "subtitles='C\:\\\\Users\\\\jan\\\\Videos\\\\color.srt'"
  private addVideoFilters(args: string[], addSubtitleFilter: boolean) {
    // args.push(
    //   '-filter_complex',
    //   '[0:v][1:v]overlay=0:0[final];[final]format=yuv420p,fade=type=out:duration=1:start_time=4',
    // );
    const subtitleFilter = addSubtitleFilter ? '[0:v][1:v]overlay=0:0[final];' : '';
    const fadeFilter = `${subtitleFilter}[final]format=yuv420p,fade=type=out:duration=${FADE_OUT_DURATION}:start_time=${Math.max(
      this.duration - (FADE_OUT_DURATION + 0.2),
      0,
    )}`;
    if (this.options.complexFilter) {
      args.push('-vf', this.options.complexFilter + `[final]${fadeFilter}`);
    } else {
      args.push('-filter_complex', fadeFilter);
    }
  }

  private addAudioFilters(args: string[]) {
    args.push(
      '-i',
      this.audioInput,
      '-map',
      '2:a:0',
      '-af',
      `afade=type=out:duration=${FADE_OUT_DURATION}:start_time=${Math.max(
        this.duration - (FADE_OUT_DURATION + 0.2),
        0,
      )}`,
    );
  }
  private async addSubtitleInput(args: string[], exportOptions: IExportOptions) {
    const subtitleDirectory = exportOptions.subtitles.directory;
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
