import { $t } from 'services/i18n';

export abstract class HighlighterError extends Error {
  abstract get userMessage(): string;
}

export class FrameWriteError extends HighlighterError {
  get userMessage() {
    return $t('An error occurred while writing the video file');
  }
}

export class FrameReadError extends HighlighterError {
  constructor(private file: string) {
    super();
  }

  get userMessage() {
    return $t('An error occurred while reading %{file}', { file: this.file });
  }
}

export class AudioReadError extends HighlighterError {
  constructor(private file: string) {
    super();
  }

  get userMessage() {
    return $t('An error occurred while reading audio from %{file}', { file: this.file });
  }
}

export class AudioMixError extends HighlighterError {
  get userMessage() {
    return $t('An error occurred while mixing audio');
  }
}
