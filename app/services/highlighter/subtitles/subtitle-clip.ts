import { SubtitleMode } from './subtitle-mode';
import { ClipElement } from './clip-element';
import { Transcription } from './transcription';
import { toSrtFormat, toVttFormat } from './subtitle-utils';

export class SubtitleClip extends ClipElement {
  _transcriptionReference: Transcription;

  public get text(): string {
    return this._transcriptionReference
      .sliceWords(this.startIndex, this.endIndex + 1)
      .filter(word => !word.isCut && !word.isPause)
      .map(word => word.text)
      .join(' ');
  }

  constructor(
    startIndex: number,
    endIndex: number,
    mediaIndex: number,
    _transcriptionReference: Transcription,
  ) {
    super(_transcriptionReference);
    this.startIndex = startIndex;
    this.endIndex = endIndex;
    this.mediaIndex = mediaIndex;
  }

  public getDynamicSubtitleClips(): SubtitleClip[] {
    const dynamicSubtitleClips: SubtitleClip[] = [];
    for (let index = this.startIndex; index <= this.endIndex; index++) {
      const word = this._transcriptionReference.words[index];
      if (!word.isPause) {
        dynamicSubtitleClips.push(
          new SubtitleClip(this.startIndex, index, this.mediaIndex, this._transcriptionReference),
        );
      } else {
        dynamicSubtitleClips.push(
          new SubtitleClip(index, index, this.mediaIndex, this._transcriptionReference),
        );
      }
    }

    return dynamicSubtitleClips;
  }

  //     /**
  //      * Assembly Function for different file specification, subtitles
  //      */
  public assembleSrtString(
    line: string,
    startTime: number,
    endTime: number,
    index: number,
    subtitleMode: SubtitleMode,
  ) {
    let srtStartTime = startTime;
    let srtEndTime = endTime;

    let srtPreviousEndTime =
      this._transcriptionReference.words[this.startIndex - 1]?.endTimeInEdit || 0;

    if (subtitleMode === SubtitleMode.dynamic) {
      srtStartTime = this._transcriptionReference.words[this.endIndex].startTimeInEdit;
      srtEndTime = this._transcriptionReference.words[this.endIndex].endTimeInEdit;
      srtPreviousEndTime = this._transcriptionReference.words[this.endIndex - 1].endTimeInEdit;
    }
    let srtString = '';
    if (index > 0) {
      if (srtPreviousEndTime > srtStartTime) {
        const diff = srtPreviousEndTime - srtStartTime;
        srtStartTime -= diff + 0.001;
      }
    }
    if (srtStartTime === srtEndTime) {
      return null;
    } else if (srtStartTime > srtEndTime) {
      const diff = srtEndTime - srtStartTime;
      srtEndTime -= diff + 0.001;
    }

    if (line) {
      srtString += index + 1;
      srtString += '\n'; // newLine
      srtString += `${toSrtFormat(srtStartTime)} --> ${toSrtFormat(srtEndTime)}`; // Start and endtime
      srtString += '\n'; // newLine
      srtString += line; // actual Text
      srtString += '\n'; // newLine
      srtString += '\n'; // newLine
    }
    return srtString;
  }

  assembleVttString(
    line: string,
    startTime: number,
    endTime: number,
    index: number,
    subtitleMode: SubtitleMode,
  ) {
    let vttString = '';
    let vttStartTime = startTime;
    let vttEndTime = endTime;
    let vttPreviousEndTime = this._transcriptionReference.words[this.startIndex - 1]?.endTimeInEdit;

    if (subtitleMode === SubtitleMode.dynamic) {
      vttStartTime = this._transcriptionReference.words[this.endIndex].startTimeInEdit;
      vttEndTime = this._transcriptionReference.words[this.endIndex].endTimeInEdit;
      vttPreviousEndTime = this._transcriptionReference.words[this.endIndex - 1]?.endTimeInEdit;
    }

    if (index > 0) {
      if (vttPreviousEndTime > vttStartTime) {
        const diff = vttPreviousEndTime - vttStartTime;
        vttStartTime -= diff + 0.001;
      }
    }
    if (vttStartTime === vttEndTime) {
      return null;
    } else if (vttStartTime > vttEndTime) {
      const diff = vttEndTime - vttStartTime;
      vttEndTime -= diff + 0.001;
    }

    if (line) {
      vttString += '\n'; // newLine
      vttString += `${toVttFormat(vttStartTime)} --> ${toVttFormat(vttEndTime)} align:middle`; // Start and endTime
      vttString += '\n'; // newLine
      vttString += line; // actual Text
      vttString += '\n'; // newLine
      vttString += '\n'; // newLine
    }
    return vttString;
  }
}
