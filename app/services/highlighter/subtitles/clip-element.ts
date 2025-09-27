import { Transcription } from './transcription';

export abstract class ClipElement {
  protected _transcriptionReference: Transcription;
  public startIndex: number;
  public endIndex: number;
  public mediaIndex: number;

  public get startTimeInEdit(): number {
    return this._transcriptionReference.getStartTimeInEditAtIndex(this.startIndex);
  }
  public get endTimeInEdit(): number {
    return this._transcriptionReference.getEndTimeInEditAtIndex(this.endIndex);
  }
  public get startTimeInOriginal(): number {
    return this._transcriptionReference.getStartTimeInOriginalAtIndex(this.startIndex);
  }
  public get endTimeInOriginal(): number {
    return this._transcriptionReference.getEndTimeInOriginalAtIndex(this.endIndex);
  }

  constructor(transcriptionReference: Transcription) {
    this._transcriptionReference = transcriptionReference;
  }
}
