import url from 'url';
import { ViewHandler } from '../core';
import { IHighlighterState } from './models/highlighter.models';
import { AVAILABLE_TRANSITIONS } from './models/rendering.models';

export class HighlighterViews extends ViewHandler<IHighlighterState> {
  /**
   * Returns an array of clips
   */
  get clips() {
    return Object.values(this.state.clips);
  }
  get clipsDictionary() {
    return this.state.clips;
  }

  /**
   * Returns wether or not the AiHighlighter should be used
   */
  get useAiHighlighter() {
    return this.state.useAiHighlighter;
  }

  /**
   * Returns wether or not the AiHighlighter should be used
   */
  get highlightedStreams() {
    return this.state.highlightedStreams;
  }

  /**
   * Whether any clips need to be loaded
   */
  get loaded() {
    return !this.clips.some(c => !c.loaded);
  }

  get loadedCount() {
    let count = 0;

    this.clips.forEach(c => {
      if (c.loaded) count++;
    });

    return count;
  }

  get exportInfo() {
    return this.state.export;
  }

  get uploadInfo() {
    return this.state.upload;
  }

  get transition() {
    return this.state.transition;
  }

  get audio() {
    return this.state.audio;
  }

  get video() {
    return this.state.video;
  }

  get transitionDuration() {
    return this.transition.type === 'None' ? 0 : this.state.transition.duration;
  }

  get availableTransitions() {
    return AVAILABLE_TRANSITIONS;
  }

  get dismissedTutorial() {
    return this.state.dismissedTutorial;
  }

  get error() {
    return this.state.error;
  }

  get highlighterVersion() {
    return this.state.highlighterVersion;
  }

  get isUpdaterRunning() {
    return this.state.isUpdaterRunning;
  }

  get updaterProgress() {
    return this.state.updaterProgress;
  }

  /**
   * Takes a filepath to a video and returns a file:// url with a random
   * component to prevent the browser from caching it and missing changes.
   * @param filePath The path to the video
   */
  getCacheBustingUrl(filePath: string) {
    return `${url.pathToFileURL(filePath).toString()}?time=${Date.now()}`;
  }
}
