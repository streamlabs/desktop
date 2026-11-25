import { test, useWebdriver } from '../../helpers/webdriver';
import { addSource } from '../../helpers/modules/sources';
import { getApiClient } from '../../helpers/api-client';
import { closeWindow, focusChild, focusMain, waitForDisplayed } from '../../helpers/modules/core';
import { getWindowsService, waitForChildWindowState } from '../../helpers/modules/widgets-ui';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

// Minimal shape of the SourcesService (external API with a fallback to the internal service)
interface ISourcesApi {
  getSourcesByName(name: string): { sourceId: string }[];
  showInteractWindow(sourceId: string): void;
}

async function getSources() {
  const api = await getApiClient();
  return api.getResource<ISourcesApi>('SourcesService');
}

async function getSourceId(name: string) {
  const sources = await getSources();
  return sources.getSourcesByName(name)[0].sourceId;
}

test('Interact window opens for a browser source and closes cleanly', async t => {
  const sourceName = 'Interact Browser Source';
  await addSource('Browser Source', sourceName);
  await focusMain();

  const sources = await getSources();
  const windows = await getWindowsService();

  const sourceId = await getSourceId(sourceName);
  sources.showInteractWindow(sourceId);

  t.true(await waitForChildWindowState('BrowserSourceInteraction', true), 'interact window shown');
  await focusChild();

  // the window hosts the OBS display of the source
  await waitForDisplayed('.display', { timeout: 15000 });
  const options = windows.getChildWindowOptions();
  t.is(options.title, `Interact: ${sourceName}`);
  t.is(options.queryParams.sourceId, sourceId);

  // interact with the display, the window must survive mouse and keyboard input
  const client = t.context.app.client;
  const $display = await client.$('.display');
  await $display.click();
  await client.keys('a');
  await $display.waitForDisplayed();
  t.true(windows.getIsChildWindowShown('BrowserSourceInteraction'));

  // close the window
  await closeWindow('child');
  t.true(
    await waitForChildWindowState('BrowserSourceInteraction', false),
    'interact window closed',
  );
  await focusMain();

  // the window can be opened again after being closed
  sources.showInteractWindow(sourceId);
  t.true(
    await waitForChildWindowState('BrowserSourceInteraction', true),
    'interact window reopened',
  );
  await focusChild();
  await waitForDisplayed('.display', { timeout: 15000 });
  await closeWindow('child');
  t.true(await waitForChildWindowState('BrowserSourceInteraction', false));
});

test('Interact window does not open for a non browser source', async t => {
  const sourceName = 'Interact Color Source';
  await addSource('Color Block', sourceName);
  await focusMain();

  const sources = await getSources();
  sources.showInteractWindow(await getSourceId(sourceName));
  t.false(await waitForChildWindowState('BrowserSourceInteraction', true, 3000));
});
