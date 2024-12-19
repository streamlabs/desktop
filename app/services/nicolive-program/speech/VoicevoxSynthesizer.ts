import * as Sentry from '@sentry/vue';
import { Speech } from '../nicolive-comment-synthesizer';
import { ISpeechSynthesizer } from './ISpeechSynthesizer';

export const VoicevoxURL = `http://localhost:50021`;

export class VoicevoxSynthesizer implements ISpeechSynthesizer {
  private speakingPromise: Promise<void> | null = null;
  private speakingResolve: () => void | null = null;
  private speakingCounter: number = 0;

  private audio?: HTMLAudioElement = null;
  private canceled = false;

  async playAudioAndWait(blob: Blob): Promise<void> {
    return new Promise((resolve, reject) => {
      this.audio?.pause();

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      this.audio = audio;

      const done = () => {
        audio.src = '';
        this.audio = null;
        URL.revokeObjectURL(url);
        resolve();
      };

      audio.addEventListener('pause', done, { once: true });
      audio.addEventListener('ended', done, { once: true });

      audio.play().catch(error => reject(error));
    });
  }

  async output(speech: Speech) {
    this.canceled = false;
    const id = speech.voicevox?.id ?? '1';
    // POSTだがqueryで
    const r1 = await fetch(
      `${VoicevoxURL}/audio_query?speaker=${id}&text=${encodeURIComponent(speech.text)}`,
      { method: 'POST' },
    );
    if (this.canceled) return;

    const r2 = await r1.json();
    if (this.canceled) return;
    r2.speedScale = speech.rate;
    r2.volumeScale = speech.volume;

    const r3 = await fetch(`${VoicevoxURL}/synthesis?speaker=${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'audio/wav' },
      body: JSON.stringify(r2),
    });

    const r4 = await r3.blob();
    if (this.canceled) return;
    await this.playAudioAndWait(r4);
  }

  speakText(speech: Speech, onstart: () => void, onend: () => void) {
    return async () => async () => {
      if (!speech || speech.text === '') {
        return null;
      }
      if (!this.speakingPromise) {
        this.speakingPromise = new Promise(resolve => {
          this.speakingResolve = resolve;
        });
      }

      onstart();
      this.output(speech)
        .catch(error => {
          Sentry.withScope(scope => {
            scope.setLevel('error');
            scope.setTag('in', 'VoicevoxSynthesizer:speakText');
            scope.setExtra('speech', speech);
            scope.setExtra('error', error);
            scope.setFingerprint(['VoicevoxSynthesizer', 'speakText', 'error']);
            Sentry.captureException(error);
          });
          console.info(`VoicevoxSynthesizer: text:${JSON.stringify(speech.text)} -> ${error}`);
        })
        .finally(() => {
          if (--this.speakingCounter === 0) {
            this.speakingResolve();
            this.speakingPromise = null;
            this.speakingResolve = null;
          }
          onend();
        });

      this.speakingCounter++;
      return {
        cancel: async () => {
          this.audio?.pause();
          this.audio = null;
          this.canceled = true;
        },
        running: this.speakingPromise,
      };
    };
  }
}
