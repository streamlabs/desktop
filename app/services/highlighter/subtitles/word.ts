import { roundTime } from './subtitle-utils';

export interface IWordIndex {
  index: number;
  word: Word;
}

export class Word {
  // properties available from firebase
  text: string;
  startTimeInEdit: number;
  endTimeInEdit: number;
  isCut = false;
  isPause = false;
  hasLinebreak = false;
  hasSubtitlebreak?: boolean;
  speakerTag?: number;
  confidence?: number;

  // properties generated after loaded
  mediaIndex: number;
  chunkIndex: number;
  startTimeInOriginal: number;
  endTimeInOriginal: number;

  public get isEndOfSentence(): boolean {
    const punctuation = ['.', '?', '!', '。'];
    return this.text && punctuation.some(item => this.text.includes(item));
  }

  public get hasPunctuation(): boolean {
    const punctuation = ['.', '?', '!', ':', '。'];
    return this.text && punctuation.some(item => this.text.includes(item));
  }

  public get hasPunctuationAndComma(): boolean {
    const punctuation = ['.', ',', '?', '!', ':', ';', '。'];
    return this.text && punctuation.some(item => this.text.includes(item));
  }
  public get isFiller(): boolean {
    const fillers = ['um', 'uh', 'hmm', 'mhm', 'uh huh'];
    return this.text && fillers.some(item => this.text.toLowerCase().includes(item));
  }

  public get duration(): number {
    return this.endTimeInEdit - this.startTimeInEdit;
  }
  public get isRealWord(): boolean {
    return this.isCut !== true && this.isPause !== true;
  }

  public setMediaIndex(mediaIndex: number) {
    this.mediaIndex = mediaIndex;
    return this;
  }
  public setChunkIndex(chunkIndex: number) {
    this.chunkIndex = chunkIndex;
    return this;
  }

  constructor() {
    return this;
  }
  public clone(word: Word): Word {
    this.text = word.text;

    // this.startTimeInEdit = word.startTimeInEdit;
    // this.endTimeInEdit = word.endTimeInEdit;

    this.startTimeInEdit = word.startTimeInOriginal;
    this.endTimeInEdit = word.endTimeInOriginal;

    this.startTimeInOriginal = word.startTimeInOriginal;
    this.endTimeInOriginal = word.endTimeInOriginal;

    this.isCut = word.isCut || false;
    this.isPause = word.isPause || false;
    this.hasLinebreak = word.hasLinebreak || false;
    this.hasSubtitlebreak = word.hasSubtitlebreak;
    this.speakerTag = word.speakerTag;
    this.confidence = word.confidence;

    this.mediaIndex = word.mediaIndex;
    this.chunkIndex = word.chunkIndex;
    return this;
  }

  // start and endTime functions

  // moves word forwards - appears earlier
  public moveForwardsFromOriginal(time: number) {
    this.startTimeInEdit = roundTime(this.startTimeInOriginal - time);
    this.endTimeInEdit = roundTime(this.endTimeInOriginal - time);
  }
  // moves word backwards - appears later
  public moveBackwardsFromOriginal(time: number) {
    this.startTimeInEdit = roundTime(this.startTimeInOriginal + time);
    this.endTimeInEdit = roundTime(this.endTimeInOriginal + time);
  }

  public fromTranscriptionService(
    text: string,
    startTime: number,
    endTime: number,
    speakerTag: number,
    confidence: number,
  ): Word {
    if (text.includes('<') && text.includes('>', text.length - 2)) {
      this.isPause = true;
    } else {
      this.text = text;
    }
    this.startTimeInEdit = startTime;
    this.startTimeInOriginal = startTime;
    this.endTimeInEdit = endTime;
    this.endTimeInOriginal = endTime;
    this.speakerTag = speakerTag || 0;
    this.confidence = confidence;
    return this;
  }

  public init(startTime: number, endTime: number, mediaIndex: number, speakerTag: number) {
    this.startTimeInEdit = startTime;
    this.endTimeInEdit = endTime;
    this.startTimeInOriginal = startTime;
    this.endTimeInOriginal = endTime;
    this.mediaIndex = mediaIndex;
    this.speakerTag = speakerTag;
    return this;
  }
  public initPauseWord(startTime: number, endTime: number, mediaIndex: number, speakerTag: number) {
    this.isPause = true;
    return this.init(startTime, endTime, mediaIndex, speakerTag);
  }
  public initZero() {
    this.startTimeInEdit = 0;
    this.endTimeInEdit = 0;
    this.startTimeInOriginal = 0;
    this.endTimeInOriginal = 0;
    return this;
  }
  public initCutWord() {
    this.isCut = true;
    return this;
  }
  public initLinebreak() {
    this.hasLinebreak = true;
    return this;
  }

  public equals(otherWord: Word): boolean {
    // properties available from firebase
    return (
      this.text === otherWord.text &&
      this.startTimeInEdit === otherWord.startTimeInEdit &&
      this.endTimeInEdit === otherWord.endTimeInEdit &&
      this.isCut === otherWord.isCut &&
      this.isPause === otherWord.isPause &&
      this.hasLinebreak === otherWord.hasLinebreak &&
      this.hasSubtitlebreak === otherWord.hasSubtitlebreak &&
      this.speakerTag === otherWord.speakerTag &&
      this.mediaIndex === otherWord.mediaIndex &&
      this.chunkIndex === otherWord.chunkIndex &&
      this.startTimeInOriginal === otherWord.startTimeInOriginal &&
      this.endTimeInOriginal === otherWord.endTimeInOriginal
    );
  }
}
