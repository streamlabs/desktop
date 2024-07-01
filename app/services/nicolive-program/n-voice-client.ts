// N Voice Client Service

import * as Sentry from '@sentry/vue';
import electron from 'electron';
import { join } from 'path';
import { StatefulService } from 'services/core/stateful-service';
import { $t } from 'services/i18n';
import { sleep } from 'util/sleep';
import { getNVoicePath, NVoiceClient } from './speech/NVoiceClient';
import { INVoiceTalker } from './speech/NVoiceSynthesizer';
import * as remote from '@electron/remote';

/** play audio from Buffer as wave file.
 * @return .cancel function to stop playing.
 * @return .done promise to wait until playing is completed.
 */
async function playAudio(
  buffer: Buffer,
  volume: number = 1.0,
): Promise<{ cancel: () => void; done: Promise<void> }> {
  const url = URL.createObjectURL(new Blob([buffer]));
  let cancel: () => void;

  let completed = false;
  const done = new Promise<void>((resolve, reject) => {
    const audio = new Audio(url);
    audio.volume = volume;
    audio.addEventListener('error', () => {
      reject(audio.error);
    });
    audio.addEventListener('ended', () => {
      resolve();
    });
    const playPromise = audio.play();
    cancel = () => {
      if (!completed) {
        playPromise
          .then(() => {
            audio.pause();
          })
          .catch(err => {
            Sentry.withScope(scope => {
              scope.setLevel('error');
              scope.setTag('in', 'playAudio:cancel');
              Sentry.captureException(err);
            });
          })
          .finally(() => {
            resolve();
          });
      }
    };
  }).finally(() => {
    completed = true;
    URL.revokeObjectURL(url);
  });
  return {
    cancel,
    done,
  };
}

interface INVoiceClientState {
  enabled: boolean;
}

async function showError(err: Error): Promise<void> {
  await remote.dialog.showMessageBox(remote.getCurrentWindow(), {
    type: 'error',
    message: err.toString(),
    buttons: [$t('common.close')],
    noLink: true,
  });
}

export class NVoiceClientService
  extends StatefulService<INVoiceClientState>
  implements INVoiceTalker
{
  static initialState: INVoiceClientState = {
    enabled: true,
  };

  private client: NVoiceClient;

  init(): void {
    this.client = new NVoiceClient({ baseDir: getNVoicePath(), onError: showError });
  }

  private index = 0;
  private speaking: Promise<void> | undefined;

  async talk(
    text: string,
    options: {
      speed: number;
      volume: number;
      maxTime: number;
      phonemeCallback?: (phoneme: string) => void;
    },
  ): Promise<null | (() => Promise<{ cancel: () => void; speaking: Promise<void> } | null>)> {
    const client = this.client;
    const tempDir = remote.app.getPath('temp');
    const wavFileName = join(tempDir, `n-voice-talk-${this.index}.wav`);
    this.index++;
    await client.set_max_time(options.maxTime);
    const { wave, labels } = await client.talk(options.speed, text, wavFileName);
    if (!wave) {
      // なにも発音しないときは無視
      return null;
    }

    return async () => {
      if (this.speaking) {
        await this.speaking;
      }

      const startTime = Date.now();
      const { cancel, done } = await playAudio(wave, options.volume);
      let phonemeCancel = false;
      if (options.phonemeCallback) {
        const phonemeLoop = async () => {
          for (const label of labels) {
            const elapsed = Date.now() - startTime;
            const start = label.start * 1000;
            if (start > elapsed) {
              await sleep(start - elapsed);
            }
            if (phonemeCancel) {
              break;
            }
            options.phonemeCallback(label.phoneme);
          }
          options.phonemeCallback(''); // done
        };
        phonemeLoop();
      }
      this.speaking = done;
      return {
        cancel: () => {
          phonemeCancel = true;
          cancel();
        },
        speaking: done,
      };
    };
  }
}
