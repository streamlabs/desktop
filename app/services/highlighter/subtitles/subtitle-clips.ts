import { SubtitleMode } from './subtitle-mode';
import { SubtitleClip } from './subtitle-clip';

export class SubtitleClips {
  private _subtitleClips: SubtitleClip[];

  public get length(): number {
    return this._subtitleClips.length;
  }
  public get clips(): SubtitleClip[] {
    return this._subtitleClips;
  }

  constructor() {
    this._subtitleClips = [];
  }

  public getClipByTime(time: number, mediaIndex: number) {
    return this._subtitleClips.find(
      subtitleClip =>
        time < Math.round(subtitleClip.endTimeInOriginal * 100) / 100 &&
        time >= subtitleClip.startTimeInOriginal &&
        mediaIndex === subtitleClip.mediaIndex,
    );
  }
  public push(subtitleClip: SubtitleClip) {
    this._subtitleClips.push(subtitleClip);
  }
  public forEach(callback: (subtitleClip: SubtitleClip) => void) {
    for (let index = 0; index < this._subtitleClips.length; index++) {
      const subtitleClip = this._subtitleClips[index];
      callback(subtitleClip);
    }
  }

  public convertToDynamicSubtitles(): void {
    const dynamicSubtitleClips: SubtitleClip[] = [];
    this._subtitleClips.forEach((subtitleClip: SubtitleClip) => {
      dynamicSubtitleClips.push(...subtitleClip.getDynamicSubtitleClips());
    });
    this._subtitleClips = dynamicSubtitleClips;
  }

  public getSrtString(subtitleMode: SubtitleMode) {
    let srtString = '';
    let indexCounter = 0;
    for (let index = 0; index < this._subtitleClips.length; index++) {
      const subtitleClip = this._subtitleClips[index];
      const previousSubtitleClip = this._subtitleClips[index - 1];

      const newLine = subtitleClip.assembleSrtString(
        subtitleClip.text,
        subtitleClip.startTimeInEdit,
        subtitleClip.endTimeInEdit,
        indexCounter,
        subtitleMode,
      );
      if (newLine) {
        srtString += newLine;
        indexCounter += 1;
      }
    }
    return srtString;
  }
  public getVttString(subtitleMode: SubtitleMode) {
    let vttString = 'WEBVTT\n\n';
    let indexCounter = 0;
    for (let index = 0; index < this._subtitleClips.length; index++) {
      const subtitleClip = this._subtitleClips[index];
      const previousSubtitleClip = this._subtitleClips[index - 1];

      const newLine = subtitleClip.assembleVttString(
        subtitleClip.text,
        subtitleClip.startTimeInEdit,
        subtitleClip.endTimeInEdit,
        index,
        subtitleMode,
      );
      if (newLine) {
        vttString += newLine;
        indexCounter += 1;
      }
    }
    return vttString;
  }

  /**
   * Returns an array with every start and end index of a subtitle clip
   */
  getStartEndArray(subtitleMode: SubtitleMode): { start: number; end: number }[] {
    return this._subtitleClips
      .map((subtitleClip, index) => {
        if (subtitleMode === SubtitleMode.static) {
          return { start: subtitleClip.startIndex, end: subtitleClip.endIndex };
        } else if (subtitleMode === SubtitleMode.dynamic) {
          if (
            (this._subtitleClips[index + 1]?.startIndex ===
              this._subtitleClips[index + 1]?.endIndex &&
              this._subtitleClips[index + 1]?.text.length > 0) ||
            this._subtitleClips[index]._transcriptionReference.words[
              this._subtitleClips[index].endIndex
            ].hasSubtitlebreak === true
          ) {
            return { start: subtitleClip.startIndex, end: subtitleClip.endIndex };
          }
          return { start: null, end: null };
        }
        return { start: null, end: null };
      })
      .filter(value => value.start !== null && value.end !== null);
  }
}
