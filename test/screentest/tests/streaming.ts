import { skipCheckingErrorsInLog, test, useWebdriver } from '../../helpers/webdriver';
import { logIn } from '../../helpers/webdriver/user';
import { fillForm, selectTitle } from '../../helpers/form-monkey';
import { makeScreenshots, useScreentest } from '../screenshoter';
import { TPlatform } from '../../../app/services/platforms';
import { fetchMock, installFetchMock, resetFetchMock } from '../../helpers/webdriver/network';
import { getApiClient } from '../../helpers/api-client';
import { ScenesService } from 'services/api/external-api/scenes';
import { sleep } from '../../helpers/sleep';
import { prepareToGoLive } from '../../helpers/modules/streaming';
import { focusChild, focusMain } from '../../helpers/modules/core';

useWebdriver();
useScreentest();

async function addColorSource() {
  const api = await getApiClient();
  api
    .getResource<ScenesService>('ScenesService')
    .activeScene.createAndAddSource('MyColorSource', 'color_source');
}

// test streaming for each platform
// TODO: YT tests is flaky on CI
const platforms: TPlatform[] = ['twitch', 'facebook'];
platforms.forEach(platform => {
  test(`Streaming to ${platform}`, async t => {
    // login into the account
    if (!(await logIn(t, platform))) return;
    const app = t.context.app;

    await prepareToGoLive();

    // open EditStreamInfo window
    await focusMain();
    await (await app.client.$('button=Go Live')).click();
    await focusChild();
    if (await (await app.client.$('button=Go Live')).isExisting()) {
      await (await app.client.$('button=Go Live')).click();
    }

    // fill streaming data
    switch (platform) {
      case 'twitch':
        await fillForm(t, 'form[name=editStreamForm]', {
          title: 'SLOBS Test Stream',
          game: selectTitle("PLAYERUNKNOWN'S BATTLEGROUNDS"),
          tags: ['100%', 'AMA'],
        });
        break;

      case 'facebook':
        await fillForm(t, 'form[name=editStreamForm]', {
          title: 'SLOBS Test Stream',
          game: selectTitle('Fortnite'),
          description: 'SLOBS Test Stream Description',
        });
        break;

      case 'youtube':
        await fillForm(t, 'form[name=editStreamForm]', {
          title: 'SLOBS Test Stream',
          description: 'SLOBS Test Stream Description',
        });
        break;
    }

    await makeScreenshots(t, 'before_stream');

    await (await app.client.$('button=Confirm & Go Live')).click();

    // check we're streaming
    await focusMain();
    await (await app.client.$('button=End Stream')).waitForExist({ timeout: 20 * 1000 });

    // give the GoLive window a couple of seconds to become closed
    await sleep(2000);

    // open the editStreamInfo dialog
    await (await app.client.$('.multichat-info .icon-edit')).click();
    await focusChild();
    await (await app.client.$('input')).waitForExist({ timeout: 20 * 1000 });
    await makeScreenshots(t, 'in_stream');
    t.pass();
  });
});

// test scheduling for each platform
const schedulingPlatforms: TPlatform[] = ['facebook', 'youtube'];
schedulingPlatforms.forEach(platform => {
  test(`Schedule stream to ${platform}`, async t => {
    // login into the account
    if (!(await logIn(t, platform))) return;
    const app = t.context.app;

    // open EditStreamInfo window
    await focusMain();
    await (await app.client.$('button .icon-date')).click();
    await focusChild();

    // fill streaming data
    switch (platform) {
      case 'facebook':
        await fillForm(t, 'form[name=editStreamForm]', {
          title: 'SLOBS Test Stream',
          game: selectTitle('Fortnite'),
          description: 'SLOBS Test Stream Description',
        });
        break;

      case 'youtube':
        await fillForm(t, 'form[name=editStreamForm]', {
          title: 'SLOBS Test Stream',
          description: 'SLOBS Test Stream Description',
        });
        break;
    }

    await makeScreenshots(t, 'before schedule');
    t.pass();
  });
});

test('Go live error', async t => {
  // login into the account
  if (!(await logIn(t, 'twitch'))) return;
  const app = t.context.app;

  // add a single source to prevent showing the No-Sources dialog
  await addColorSource();

  // simulate issues with the twitch api
  await installFetchMock(t);
  await fetchMock(t, /api\.twitch\.tv/, 404);
  skipCheckingErrorsInLog();

  // open EditStreamInfo window
  await focusMain();
  await (await app.client.$('button=Go Live')).click();
  await focusChild();

  // check that the error text is shown
  await (await app.client.$('a=just go live')).waitForDisplayed();
  await makeScreenshots(t, 'network error');

  await resetFetchMock(t);
  t.pass();
});
