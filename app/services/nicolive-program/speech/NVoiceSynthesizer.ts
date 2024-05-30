import * as Sentry from '@sentry/vue';
import { Speech } from '../nicolive-comment-synthesizer';
import { ISpeechSynthesizer } from './ISpeechSynthesizer';

export interface INVoiceTalker {
  talk(
    text: string,
    options: {
      speed: number;
      volume: number;
      maxTime: number;
      phonemeCallback?: (phoneme: string) => void;
    },
  ): Promise<() => Promise<{ cancel: () => void; speaking: Promise<void> } | null>>;
}

export class NVoiceSynthesizer implements ISpeechSynthesizer {
  constructor(private nVoiceTalker: INVoiceTalker) {}

  speakText(
    speech: Speech,
    onstart: () => void,
    onend: () => void,
    onPhoneme?: (phoneme: string) => void,
  ) {
    return async () => {
      try {
        const start = await this.nVoiceTalker.talk(speech.text, {
          speed: 1 / (speech.rate || 1),
          volume: speech.volume,
          maxTime: speech.nVoice?.maxTime,
          phonemeCallback: (phoneme: string) => {
            if (onPhoneme) {
              onPhoneme(phoneme);
            }
          },
        });
        if (!start) {
          return null;
        }
        return async () => {
          const r = await start();
          if (r === null) {
            // no sound
            return null;
          }
          (async () => {
            onstart();
            await r.speaking;
            onend();
          })();
          return {
            cancel: async () => {
              r.cancel();
              await r.speaking;
            },
            running: r.speaking,
          };
        };
      } catch (error) {
        Sentry.withScope(scope => {
          scope.setLevel('error');
          scope.setTag('in', 'NVoiceSynthesizer:speakText');
          scope.setExtra('speech', speech);
          scope.setExtra('error', error);
          scope.setFingerprint(['NVoiceSynthesizer', 'speakText', 'error']);
          Sentry.captureException(error);
        });
        console.info(`NVoiceSynthesizer: text:${JSON.stringify(speech.text)} -> ${error}`);
      }
    };
  }
}
