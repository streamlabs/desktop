import { debugPause, skipCheckingErrorsInLog, test, useWebdriver } from '../helpers/webdriver';
import { sceneExisting, switchCollection } from '../helpers/modules/scenes';
import { sourceIsExisting } from '../helpers/modules/sources';
import { getApiClient } from '../helpers/api-client';
import { WidgetsService } from '../../app/services/widgets';
import { EWidgetType } from '../helpers/widget-helpers';
import { FormMonkey } from '../helpers/form-monkey';
import { ExecutionContext } from 'ava';
import {
  click,
  clickIfDisplayed,
  focusChild,
  focusMain,
  isDisplayed,
  waitForDisplayed,
} from '../helpers/modules/core';
import { logIn } from '../helpers/webdriver/user';
import { sleep } from '../helpers/sleep';

const path = require('path');

useWebdriver({ skipOnboarding: false, beforeAppStartCb: installOBSCache });

async function installOBSCache(t: ExecutionContext) {
  // extract OBS config to the cache dir
  // @ts-ignore Spectron typings are wrong - app is actually under remote
  const cacheDir = path.resolve(t.context.cacheDir);
  const dataDir = path.resolve(__dirname, '..', '..', '..', 'test', 'data');
  const obsCacheZipPath = path.resolve(dataDir, 'obs-studio.zip');

  const extractZip = require('extract-zip');
  await new Promise<void>(async (resolve, reject) => {
    extractZip(obsCacheZipPath, { dir: cacheDir }, (err: any) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

test('OBS Importer', async t => {
  // Disabling due to incorrect state set issue in useModule
  skipCheckingErrorsInLog();

  const client = t.context.app.client;

  if (!(await isDisplayed('h2=Live Streaming'))) return;
  await click('h2=Live Streaming');
  await click('button=Continue');
  await click('button=Skip');

  /*
  await click('a=Login');
  await isDisplayed('button=Log in with Twitch');
  await click('button=Skip');
  */

  await logIn(t, 'twitch', { prime: false }, false, true);
  await sleep(1000);

  // import from OBS
  await click('div=Import from OBS Studio');
  await click('div=Start');

  // skip Ultra
  await waitForDisplayed('div[data-testid=choose-free-plan-btn]', { timeout: 15000 });
  // skip Themes
  await click('button=Skip');

  await waitForDisplayed('[data-name=SceneSelector]');

  // check collection 1 and sources
  await switchCollection('Collection 1');
  t.true(await sceneExisting('Scene'));
  t.true(await sceneExisting('Scene 2'));
  t.true(await sourceIsExisting('Color Source'));
  t.true(await sourceIsExisting('Text (GDI+)'));

  // check collection 2 exists
  await focusMain();
  await switchCollection('Collection 2');

  // check settings
  await (await client.$('.side-nav .icon-settings')).click();
  await focusChild();
  await (await client.$('li=Output')).click();
  const form = new FormMonkey(t);
  await form.setInputValue(await form.getInputSelectorByTitle('Video Bitrate'), '5000');
  await form.setInputValue(await form.getInputSelectorByTitle('Encoder'), 'Software (x264)');

  // check that widgets have been migrated
  await focusMain();
  await switchCollection('Widgets');
  const api = await getApiClient();
  const widgetsService = api.getResource<WidgetsService>('WidgetsService');

  t.deepEqual(
    [EWidgetType.DonationGoal, EWidgetType.EventList, EWidgetType.AlertBox],
    widgetsService.widgetSources.map(widget => (widget.type as unknown) as EWidgetType),
  );
});
