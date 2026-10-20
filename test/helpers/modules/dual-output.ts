import { sleep } from '../sleep';
import { skipCheckingErrorsInLog } from '../webdriver';
import { addDummyAccount } from '../webdriver/user';
import { getApiClient } from '../api-client';
import {
  EStreamingState,
  IStreamingServiceApi,
} from '../../../app/services/streaming/streaming-api';
import {
  click,
  clickToggle,
  clickIfDisplayed,
  focusMain,
  getClient,
  isDisplayed,
  waitForDisplayed,
} from './core';
import { fillForm } from './forms';
import {
  chatIsVisible,
  clickGoLive,
  submit,
  waitForSettingsWindowLoaded,
  waitForStreamStart,
  stopStream,
  waitForStreamStop,
} from './streaming';

/**
 * Toggle dual output mode
 * @remark Toggled from the dual output switch in the studio editor header
 * @remark Toggling runs in loading mode, which converts the scene collection before
 * showing the vertical display. The toggle itself returns immediately, so wait for the
 * vertical display to settle or assertions will run against a half converted collection.
 */
export async function toggleDualOutputMode(checkVerticalDisplay: boolean = true) {
  await focusMain();
  await clickToggle('dual-output-toggle');

  if (checkVerticalDisplay) {
    await waitForDisplayed('div#vertical-display', {
      timeout: 5000,
    });
  }
}

/**
 * Toggle display
 */
export async function toggleDisplay(display: 'horizontal' | 'vertical', wait: boolean = false) {
  if (wait) {
    await clickIfDisplayed(`div#${display}-display-toggle`);
  } else {
    await click(`div#${display}-display-toggle`);
  }
}

/**
 * Toggle an account and assign it to a display
 */
export async function toggleAccountForDisplay(display: 'horizontal' | 'vertical') {
  const platforms = ['youtube', 'instagram'];

  try {
    for (const platform of platforms) {
      if (platform === 'instagram') {
        await addDummyAccount('instagram');
        await clickGoLive();
      }

      await fillForm({ [platform]: true });
      await waitForSettingsWindowLoaded();

      const formLoaded = await isDisplayed(`div[data-name="${platform}-settings"]`);
      // If the settings form loads, then an account has successfully been toggled
      if (formLoaded) {
        if (platform === 'youtube') {
          await fillForm({
            description: 'Test Description',
            youtubeDisplay: display,
            primaryChat: 'YouTube',
          });
        }

        return platform;
      }
    }
  } catch (e: unknown) {
    console.error('Error toggling platforms.', e);
  }

  return null;
}

export async function goLiveWithDualOutput(platform: string) {
  await waitForSettingsWindowLoaded();

  await submit();

  if (platform === 'instagram') {
    await waitForDisplayed('span=Configure the Dual Output service', { timeout: 60000 });
    // Dummy accounts won't go live
    await sleep(1000);
    await chatIsVisible();
    await waitForStreamStop();
    skipCheckingErrorsInLog();
  } else {
    const streaming = (await getApiClient()).getResource<IStreamingServiceApi>('StreamingService');
    let model = streaming.getModel();
    // The success window closes after one second; both output states remain observable.
    try {
      await getClient().waitUntil(
        () => {
          model = streaming.getModel();
          const { info, status } = model;
          return (
            info.lifecycle === 'live' &&
            status.horizontal.streaming === EStreamingState.Live &&
            status.vertical.streaming === EStreamingState.Live
          );
        },
        { timeout: 60000, timeoutMsg: 'Dual Output did not finish with both streams live' },
      );
    } catch (e: unknown) {
      const { info, status } = model;
      console.error('Dual Output Go Live state:', {
        lifecycle: info.lifecycle,
        checklist: info.checklist,
        status,
        error: info.error && { type: info.error.type, message: info.error.message },
      });
      throw e;
    }
    await waitForStreamStart();
    await isDisplayed('li=Multichat');
    await stopStream();
  }
}
