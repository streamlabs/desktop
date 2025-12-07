import { SubtitleMode } from './subtitle-mode';
import { SubtitleClip } from './subtitle-clip';
import { SubtitleClips } from './subtitle-clips';
import { Word, IWordIndex } from './word';
import { removeLinebreaksFromString, roundTime } from './subtitle-utils';

export const MAX_PAUSE_TIME = 2; //0.3 work better but creates more ;

export interface ISpeaker {
  index: number;
  name: string;
}

export interface IStartEndConfig {
  startWord: number;
  endWord: number;
}

export class Transcription {
  singlePauseLength = 0.25;
  words: Word[] = [];
  isTranslation = false;

  get duration(): number {
    return this.words[this.words.length - 1].endTimeInEdit;
  }

  get onlyPauses(): boolean {
    return this.words.every(word => word.isPause);
  }

  get onlyCuts(): boolean {
    return this.words.every(word => word.isCut);
  }

  //
  // initialisation functions
  //
  clone(transcription: Transcription) {
    this.words = transcription.words.map(word => new Word().clone(word));
    this.isTranslation = transcription.isTranslation;
    return this;
  }

  setTranslation(isTranslation: boolean) {
    this.isTranslation = isTranslation;
    return this;
  }

  getLastWord(): Word {
    return this.words[this.words.length - 1];
  }
  getSubtitleLength(aspectRatio: number) {
    let charactersPerRow = 70;
    // Condition true for square, portrait, vertical post and pinterest
    if (aspectRatio <= 1) {
      charactersPerRow = 20;
    }
    return charactersPerRow;
  }
  getSpeakerIndices(skipCuts = true): number[] {
    const speakers = new Set<number>();
    for (let index = 0; index < this.words.length; index++) {
      const word = this.words[index];
      if (skipCuts && word.isCut) {
        continue;
      }
      speakers.add(word.speakerTag);
    }
    return [...speakers];
  }
  /**
   * generating abstraction of the transcription
   * @param subtitleMode subtitleMode (static, dynamic) of the current project
   * @param currentVideoFormat VideoFormatOption of the current project
   * @param subtitleLength Characters per row of the subtitle
   */
  generateSubtitleClips(
    subtitleMode: SubtitleMode,
    aspectRatio: number,
    subtitleLength?: number,
  ): SubtitleClips {
    let characterCount = 0;
    let inClip = false;
    const subtitleClips = new SubtitleClips();
    let startIndex = 0;

    let inPauseSeries = false;
    let pauseStartIndex: number = null;
    let pauseDuration = 0;
    const pushSubtitle = (
      startIndexToPush: number,
      endIndex: number,
      newStartIndex: number,
      mediaIndex: number,
    ) => {
      subtitleClips.push(new SubtitleClip(startIndexToPush, endIndex, mediaIndex, this));
      startIndex = newStartIndex;
      pauseDuration = 0;
      characterCount = 0;
      inClip = false;
      inPauseSeries = false;
    };

    const defaultCharactersPerRow = this.getSubtitleLength(aspectRatio);
    const charactersPerRow = subtitleLength || defaultCharactersPerRow;
    const isCustomLength = defaultCharactersPerRow !== charactersPerRow;
    const lastNonCutWord = this.getLastNonCutWord();

    let breakOnComma = false;

    // Condition true for square, portrait, vertical post and pinterest
    if (aspectRatio <= 1 && !isCustomLength) {
      breakOnComma = true;
    }
    let previousMediaIndex = this.words[0]?.mediaIndex;
    for (let index = 0; index < lastNonCutWord; index++) {
      const word = this.words[index];
      const mediaIndexChanged = previousMediaIndex !== word.mediaIndex;

      // video source changed
      if (mediaIndexChanged) {
        pushSubtitle(startIndex, index - 1, index, previousMediaIndex);
        previousMediaIndex = word.mediaIndex;
        continue;
      }
      previousMediaIndex = word.mediaIndex;

      //
      if (word.hasSubtitlebreak === true && !word.isCut && index > 0) {
        pushSubtitle(startIndex, index, index + 1, word.mediaIndex);
        continue;
      }
      // skip cuts
      if (word.isCut) {
        if (!inClip) {
          startIndex = index + 1;
        }
        continue;
      }

      if (word.isPause) {
        pauseDuration += word.duration;
        if (!inPauseSeries) {
          // pause series started
          //lastWordIndex = index - 1
          pauseStartIndex = index;
          inPauseSeries = true;
        }
      } else {
        // pause series ended
        inPauseSeries = false;
        pauseDuration = 0;
        characterCount += word.text.length + 1; //  + 1 because of the pause between words
        if (!inClip) {
          // clip started
          startIndex = index;
          inClip = true;
        }
      }

      if (inClip) {
        // subtitle ended because
        if (
          pauseDuration > MAX_PAUSE_TIME &&
          pauseStartIndex != null &&
          (word.hasSubtitlebreak === true ||
            word.hasSubtitlebreak === null ||
            word.hasSubtitlebreak === undefined)
        ) {
          // long pause
          pushSubtitle(startIndex, pauseStartIndex - 1, index + 1, word.mediaIndex);
        } else if (word.hasSubtitlebreak === false) {
          characterCount = 0;
          pauseDuration = 0;
        } else if (
          (word.hasSubtitlebreak === true ||
            word.hasSubtitlebreak === null ||
            word.hasSubtitlebreak === undefined) &&
          (characterCount + this.words[index + 1]?.text?.length > charactersPerRow ||
            (word.isEndOfSentence || breakOnComma
              ? word.hasPunctuationAndComma
              : word.hasPunctuation) ||
            word.hasSubtitlebreak)
        ) {
          // maximum of characters was reached
          // or word contains '.', ',', '?', '!', ':', ';'
          // or word was the last word of the transcription
          // and a subtitle clip has already started
          // End subtitle clip when pause is to long
          pushSubtitle(startIndex, index, index + 1, word.mediaIndex);
        }
      }
    }

    if (startIndex < lastNonCutWord + 1) {
      pushSubtitle(
        startIndex,
        lastNonCutWord,
        lastNonCutWord + 1,
        this.words[lastNonCutWord].mediaIndex,
      );
    }

    if (subtitleMode === SubtitleMode.dynamic) {
      subtitleClips.convertToDynamicSubtitles();
    }
    return subtitleClips;
  }

  calculateSelectionDuration(startEndConfig: IStartEndConfig) {
    return (
      this.words[startEndConfig?.endWord]?.endTimeInEdit -
      this.words[startEndConfig?.startWord]?.startTimeInEdit
    );
  }

  public sumTrimtimeToIndex(index: number): number {
    let sum = 0;
    this.words
      .slice(0, index)
      .filter(word => word.isCut)
      .forEach(word => {
        sum += word.duration;
      });

    return sum;
  }
  /**
   * Calculating rendered transcription with times from cutwords removed
   */
  public getShiftedTranscription(): Transcription {
    const shiftedTranscription = new Transcription().clone(this);
    let trimTime = 0;
    let mediaSourceOffset = 0;
    for (let index = 0; index < shiftedTranscription.words.length; index++) {
      const word = shiftedTranscription.words[index];
      if (index > 0 && word.mediaIndex !== shiftedTranscription.words[index - 1].mediaIndex) {
        mediaSourceOffset = shiftedTranscription.words[index - 1].endTimeInEdit;
        trimTime = 0;
      }

      trimTime += word.isCut ? word.duration : 0;
      word.moveForwardsFromOriginal(trimTime - mediaSourceOffset);
    }
    return shiftedTranscription;
  }

  //
  // accessing words
  //
  getWordByIndex(index: number): Word {
    if (this.isIndexInBounds(index)) {
      return this.words[index];
    }
    return null;
  }

  getPreviousWordByIndex(
    index: number,
    skipPauses?: boolean,
    skipCutword?: boolean,
    includeStartIndex = false,
  ): IWordIndex {
    const startIndex = includeStartIndex ? index : index - 1;
    for (let i = startIndex; i >= 0; i--) {
      const currentWord = this.words[i];
      if ((skipPauses && currentWord.isPause) || (skipCutword && currentWord.isCut)) {
        continue;
      }
      return { index: i, word: currentWord };
    }
    return null;
  }

  getNextWordByIndex(
    index: number,
    skipPauses?: boolean,
    skipCutword?: boolean,
    includeStartIndex = false,
  ): IWordIndex {
    const startIndex = includeStartIndex ? index : index + 1;
    for (let i = startIndex; i < this.words.length; i++) {
      const currentWord = this.words[i];
      if ((skipPauses && currentWord?.isPause) || (skipCutword && currentWord?.isCut)) {
        continue;
      }
      return { index: i, word: currentWord };
    }
    return null;
  }

  sliceWords(startIndex: number, endIndex: number): Word[] {
    if (this.isIndexInBounds(startIndex)) {
      return this.words.slice(startIndex, endIndex);
    }
    return [];
  }

  //
  // text related functions
  //
  public getText(
    includeTimestamps = false,
    includeSpeakers = false,
    wordChunkArray?: IWordIndex[][],
    speakers?: ISpeaker[],
    removeLinebreaks = false,
  ): string {
    let words = '';
    // If the user want to have timestamps or speakers in the export loop through the paragraphs
    if ((includeTimestamps || includeSpeakers) && wordChunkArray) {
      const filteredParagraphs = wordChunkArray
        .map(paragraphFilter => {
          const noCutwords = paragraphFilter.filter(wordIndex => !wordIndex.word.isCut);
          return [...noCutwords];
        })
        .filter(wordIndexArray => wordIndexArray.length);

      for (const paragraph of filteredParagraphs) {
        if (includeSpeakers) {
          words += speakers[paragraph[0].word.speakerTag].name;
        }
        if (includeSpeakers && includeTimestamps) {
          words += ' - ';
        }
        if (includeTimestamps) {
          words += `[${getFormattedTimeFromSeconds(
            paragraph[0].word.startTimeInEdit,
          )} - ${getFormattedTimeFromSeconds(paragraph[paragraph.length - 1].word.endTimeInEdit)}]`;
        }
        if (includeTimestamps || includeSpeakers) {
          words += '\n';
        }
        for (const wordIndex of paragraph) {
          if (!wordIndex.word.isPause) {
            words += wordIndex.word.text;
            words += ' ';
          }
          if (wordIndex.word.hasLinebreak) {
            words += '\n\n';
          }
        }
      }
    } else {
      for (const word of this.words) {
        if (!word.isCut && !word.isPause) {
          words += word.text;
          words += ' ';
        }
        if (word.hasLinebreak) {
          words += '\n\n';
        }
      }
    }
    if (removeLinebreaks) {
      words = removeLinebreaksFromString(words);
    }
    return words;
  }

  public setLinebreak(index: number, hasLinebreak: boolean): void {
    if (this.isIndexInBounds(index)) {
      this.words[index].hasLinebreak = hasLinebreak;
      this.words[index].hasSubtitlebreak = hasLinebreak;
    }
  }
  setLastWordLinebreak() {
    this.setLinebreak(this.words.length - 1, true);
  }
  public editWord(index: number, newText: string): void {
    if (this.isIndexInBounds(index)) {
      this.words[index].text = newText;
    }
  }

  public getSentencesArray(): Word[][] {
    const sentences: Word[][] = [];
    let singleSentence: Word[] = [];
    for (const [index, word] of this.words.entries()) {
      singleSentence.push(word);
      if (word.isEndOfSentence || index >= this.words.length - 1) {
        sentences.push(singleSentence);
        singleSentence = [];
      }
    }

    return sentences;
  }

  getCutStartEndConfig(): IStartEndConfig[] {
    const onlyCutWordIndices = this.words
      .map((word, index) => {
        return { index, word };
      })
      .filter(wordIndex => wordIndex.word.isCut)
      .map(wordIndex => wordIndex.index);

    let sequenceStart: number;
    const cuts: IStartEndConfig[] = [];
    for (let index = 1; index <= onlyCutWordIndices.length; index++) {
      const indexA = onlyCutWordIndices[index - 1];
      const indexB = onlyCutWordIndices[index];

      if (!sequenceStart) sequenceStart = indexA;

      if (indexA + 1 !== indexB) {
        cuts.push({ startWord: sequenceStart, endWord: indexA });
        sequenceStart = indexB;
      } else if (index === onlyCutWordIndices.length - 1) {
        cuts.push({ startWord: sequenceStart, endWord: indexB });
      }
    }
    return cuts;
  }

  //
  // time related functions
  //
  public getWordMediaIndex(index: number): number {
    if (this.isIndexInBounds(index)) {
      return this.words[index].mediaIndex;
    }
    return null;
  }
  public getStartTimeInEditAtIndex(index: number): number {
    if (this.isIndexInBounds(index)) {
      return this.words[index].startTimeInEdit;
    }
    return null;
  }

  public getEndTimeInEditAtIndex(index: number): number {
    if (this.isIndexInBounds(index)) {
      return this.words[index].endTimeInEdit;
    }
    return null;
  }
  public getStartTimeInOriginalAtIndex(index: number): number {
    if (this.isIndexInBounds(index)) {
      return this.words[index].startTimeInOriginal;
    }
    return null;
  }

  public getEndTimeInOriginalAtIndex(index: number): number {
    if (this.isIndexInBounds(index)) {
      return this.words[index].endTimeInOriginal;
    }
    return null;
  }

  // gets the index at a specific timestamp from the original video
  // jumps over cutwords
  public getIndexAtTimeInEdit(time: number): number {
    for (const [index, word] of this.words.entries()) {
      if (!word.isCut && time >= word.startTimeInEdit && time < word.endTimeInEdit) {
        return index;
      }
    }
    return -1;
  }

  public getNextIndexByTime(currentTime: number): number {
    for (let index = 0; index < this.words.length; index++) {
      const word = this.words[index];
      if (currentTime < word.endTimeInOriginal) {
        return index;
      }
    }
    // if nothing found return beginning
    return 0;
  }

  /**
   *
   * @returns duration of the edited video
   */
  public getEditedDuration(): number {
    let totalDuration = 0;
    //TODO: refactor with reduce
    this.words
      .filter(word => !word.isCut)
      .forEach(word => {
        totalDuration += word.duration;
      });

    return totalDuration;
  }
  /**
   * generating new Transcription with pauses before first word, between word with pauses and after last word
   * @param duration
   * @param skipFirstAndLastPauses
   */
  public generatePauses(duration: number, skipPausesBefore = false, skipPausesAfter = false): void {
    const newTranscription = new Transcription();

    if (this.words.length > 0) {
      if (!skipPausesBefore) {
        this.addPausesBeforeFirstWord(this.words, duration, newTranscription);
      }
      for (let i = 0; i < this.words.length; i++) {
        const word = this.words[i];
        const newWord = new Word().clone(word);
        newTranscription.words = newTranscription.words.concat(newWord);

        // check if there is a word until next word
        // create new Word with length of the pause
        const pauseWords = this.getPauseWords(this.words, i, duration);
        if (pauseWords) {
          newTranscription.words = newTranscription.words.concat(pauseWords);
        } else {
          // No Pause
        }
      }
      if (!skipPausesAfter) {
        this.addPauseAfterLastWord(this.words, duration, newTranscription);
      }
    } else {
      //empty word array
      let currentTime = 0;
      while (currentTime + this.singlePauseLength < duration) {
        const newPause = new Word().initPauseWord(
          currentTime,
          roundTime(currentTime + this.singlePauseLength),
          0,
          0,
        );
        newTranscription.words.push(newPause);
        currentTime += this.singlePauseLength;
      }
      if (duration - currentTime !== 0) {
        const newPause = new Word().initPauseWord(
          currentTime,
          roundTime(currentTime + duration - currentTime),
          0,
          0,
        );
        newTranscription.words.push(newPause);
      }
    }
    this.words = newTranscription.words;
  }

  //
  // transcription utility
  //

  private isIndexInBounds(index: number): boolean {
    return index >= 0 && index < this.words.length;
  }

  // generate pause helper
  private addPausesBeforeFirstWord(
    words: Word[],
    duration: number,
    newTranscription: Transcription,
  ) {
    const pauseWords = this.getPauseWords(words, -1, duration);
    if (pauseWords) {
      newTranscription.words = newTranscription.words.concat(pauseWords);
    }
  }
  addPausesBetweenStreamingChunks(words: Word[], duration: number) {
    if (!words.length) {
      return;
    }
    const pauseWords = this.getPauseWords(words, 0, duration);
    if (pauseWords) {
      this.words = [...pauseWords, ...this.words];
    }
  }

  private addPauseAfterLastWord(words: Word[], duration: number, newTranscription: Transcription) {
    const pauseWords = this.getPauseWords(words, words.length - 1, duration, true);
    if (pauseWords) {
      newTranscription.words = newTranscription.words.concat(pauseWords);
    }
  }
  private getPauseWords(
    words: Word[],
    index: number,
    duration?: number,
    lastPart?: boolean,
  ): Word[] {
    // seconds

    if (index + 1 < words.length || lastPart) {
      let firstWord: Word;
      let secondWord: Word;
      if (index === -1) {
        // handle first Word
        // check if there is a pause before the first word
        firstWord = new Word().initZero();
        secondWord = new Word().clone(words[0]);
      } else if (lastPart === true && index === words.length - 1) {
        // handle last Word
        // check if there is a pause after the last word
        firstWord = new Word().clone(words[index]);
        secondWord = new Word();
        secondWord.startTimeInEdit = duration;
      } else {
        firstWord = new Word().clone(words[index]);
        secondWord = new Word().clone(words[index + 1]);
      }

      const pauseTime = roundTime(secondWord.startTimeInEdit - firstWord.endTimeInEdit);

      if (pauseTime > 0) {
        const pauseCount = Math.ceil(pauseTime / this.singlePauseLength);
        const pauseWords: Word[] = [];
        let pauseStartTime = firstWord.endTimeInEdit;

        for (let i = 0; i < pauseCount; i++) {
          let leftPauseTime = roundTime(pauseTime - i * this.singlePauseLength);
          leftPauseTime =
            leftPauseTime > this.singlePauseLength
              ? this.singlePauseLength
              : roundTime(pauseTime - i * this.singlePauseLength);

          pauseWords.push(
            new Word().initPauseWord(
              pauseStartTime,
              roundTime(pauseStartTime + leftPauseTime),
              firstWord.mediaIndex,
              firstWord.speakerTag ?? secondWord.speakerTag ?? 1,
            ),
          );

          pauseStartTime += leftPauseTime;
        }
        return pauseWords;
      }
      // return words[index+1].startTime.time - words[index].endTime.time
    }
    return null;
  }
  /**
   * Checks the sentence for the most dominant speaker and set this one for the whole sentence
   */
  updateSentenceSpeaker() {
    const sentences: Word[][] = this.getSentencesArray();
    const newWords: Word[] = [];
    for (const sentence of sentences) {
      const speakerTags = sentence.filter(word => !word.isPause).map(word => word.speakerTag);
      const dominantSpeaker = speakerTags
        .slice()
        .sort(
          (a, b) =>
            speakerTags.filter(v => v === a).length - speakerTags.filter(v => v === b).length,
        )
        .pop();
      sentence.forEach(word => {
        const newWord: Word = word;
        newWord.speakerTag = dominantSpeaker;
        newWords.push(newWord);
        return newWord;
      });
    }
    this.words = newWords;
  }

  /**
   * generates necessary speaker information
   */
  public generateSpeakerInformation(): Transcription {
    const SPEAKER_MIN_PERCENTAGE = 0.05;
    // Check if SPEAKER_MIN_PERCENTAGE threshold is reached, if not set speaker to 1 for every word.
    const allSpeakerTags = this.words
      .filter(word => word.speakerTag !== null)
      .map(word => word.speakerTag);
    const counts: { [tag: number]: number } = {};
    for (const speakerTag of allSpeakerTags) {
      counts[speakerTag] = counts[speakerTag] ? counts[speakerTag] + 1 : 1;
    }
    // Only check if 2 speakers, if more just take them
    const speakerKeys = Object.keys(counts).map(Number);
    if (
      (speakerKeys.length === 2 &&
        counts[speakerKeys[0]] / allSpeakerTags.length < SPEAKER_MIN_PERCENTAGE) ||
      counts[speakerKeys[0]] / allSpeakerTags.length > 100 - SPEAKER_MIN_PERCENTAGE
    ) {
      this.words = this.words.map(word => {
        word.speakerTag = 1;
        return word;
      });
    }

    // After all the speaker stuff is done check where to set linebreaks initially (after each speaker switch)
    for (let i = 1; i < this.words.length; i++) {
      if (
        this.words[i - 1].speakerTag !== this.words[i].speakerTag &&
        this.words[i].speakerTag != null
      ) {
        this.words[i - 1].hasLinebreak = true;
      }
    }
    return this;
  }

  /**
   * Returns the word index of the last non cut word (this includes pauses)
   * @param transcription transcription
   */
  getLastNonCutWord(): number {
    let lastNonCutWordIndex = this.words.length - 1;

    if (this.words?.length) {
      for (let i = this.words.length - 1; i >= 0; i--) {
        if (!this.words[i].isCut) {
          lastNonCutWordIndex = i;
          break;
        }
      }
    }
    return lastNonCutWordIndex;
  }

  setCutword(from: number, to: number) {
    if (this.words?.length) {
      for (let i = from; i < to; i++) {
        this.words[i].initCutWord();
      }
    }
  }

  /**
   * Returns pauses
   *
   * @param startEndConfig Searches in this start end config. Default is current selection
   *
   * @param pausesThreshold Ignore if more pauses than the threshold are next to each other
   * @example If pausesThreshold is set to 4: 5, 6, 7 and more pauses after each other will NOT be returned
   */
  public getAllPauses(
    startEndConfig: IStartEndConfig = { startWord: 0, endWord: this.words.length - 1 },
    pausesThreshold = 100,
  ) {
    const words = this.words;
    const indicesToRemove: number[] = [];
    // Loop through all words
    for (
      let wordIndex = startEndConfig.startWord;
      wordIndex <= startEndConfig.endWord;
      wordIndex++
    ) {
      const currentIndices = [];
      let currentCounter = 0;
      // Check if current word + next words (based on currentCounter) have a pause. If so, check next word. If not, skip with outer loop
      for (currentCounter; words[wordIndex + currentCounter]?.isPause; currentCounter++) {
        if (
          words[wordIndex + currentCounter]?.isPause &&
          !words[wordIndex + currentCounter]?.isCut
        ) {
          currentIndices.push(wordIndex + currentCounter);
          if (!words[wordIndex + currentCounter + 1]?.isPause) {
            break;
          }
        } else {
          break;
        }
      }
      wordIndex += currentCounter;

      if (currentIndices.length < pausesThreshold && currentIndices.length > 1) {
        currentIndices.map(index => indicesToRemove.push(index));
      }
    }

    return indicesToRemove;
  }

  /**
   * Returns pauses in the current selection
   */
  getConsecutivePauses(
    startEndConfig: IStartEndConfig = { startWord: 0, endWord: this.words.length - 1 },
  ): number[][] {
    const words = this.words;
    const consecutivePausesIndices: number[][] = [];
    let index = startEndConfig.startWord;
    while (index <= startEndConfig.endWord) {
      const currentIndices = [];
      let count = 0;
      let currentWord = words[index];
      while (currentWord?.isPause && !currentWord?.isCut) {
        currentIndices.push(index + count);
        count++;
        currentWord = words[index + count];
      }
      index += currentIndices.length ? currentIndices.length : 1;
      if (currentIndices.length > 0) {
        consecutivePausesIndices.push(currentIndices);
      }
    }
    return consecutivePausesIndices;
  }
}

function getFormattedTimeFromSeconds(secondsInput: number) {
  const date = new Date(0);
  date.setSeconds(secondsInput);
  return date.toISOString().substr(secondsInput >= 3600 ? 11 : 14, secondsInput >= 3600 ? 8 : 5);
}
