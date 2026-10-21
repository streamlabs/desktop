import type { MarkersService } from 'services/markers';
import { getApiClient } from '../../helpers/api-client';
import { clickButton, focusWindow, getClient } from '../../helpers/modules/core';
import { setInputValue } from '../../helpers/modules/forms/base';
import { showSettingsWindow } from '../../helpers/modules/settings/settings';
import { restartApp, test, useWebdriver } from '../../helpers/webdriver';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

const markerIds = ['MARKER_1', 'MARKER_2', 'MARKER_3', 'MARKER_4'] as const;
const names = ['Opening', 'Great play', 'Review later', 'Closing'];
// Row test IDs use the editable descriptions, so locate the Markers group instead.
const markerGroup = '//h2[text()="Markers"]/../following-sibling::*[1]';
const labelInputs = `${markerGroup}//input[not(@data-name="binding")]`;
const bindingInputs = `${markerGroup}//input[@data-name="binding"]`;

async function openHotkeys() {
  await showSettingsWindow('Hotkeys');
  await focusWindow('child');
  await getClient().execute(() => require('@electron/remote').getCurrentWindow().focus());
  await (await getClient().$('h2=Markers')).waitForExist();
}

async function readInputs(selector: string) {
  const inputs = await getClient().$$(selector);
  return Promise.all(inputs.map(input => input.getValue()));
}

test('Preserves all four marker names and bindings after Settings reopens and the app restarts', async t => {
  await openHotkeys();
  const client = getClient();
  const api = await getApiClient();
  const markers = api.getResource<MarkersService>('MarkersService');

  for (let i = 0; i < markerIds.length; i++) {
    await (await client.$(`(${bindingInputs})[${i + 1}]`)).click();
    await client.keys(['\uE009', String(i + 1), '\uE000']);
    await setInputValue(`(${labelInputs})[${i + 1}]`, names[i]);
    await client.execute(() => (document.activeElement as HTMLElement).blur());
  }

  await client.waitUntil(() => markerIds.every((id, i) => markers.state[id] === names[i]));
  t.deepEqual(await readInputs(labelInputs), names);
  const expectedBindings = markerIds.map((_, i) => `Ctrl+${i + 1} (Click to re-bind)`);

  await clickButton('Close');
  await openHotkeys();
  t.deepEqual(await readInputs(labelInputs), names, 'Settings restores all four saved names');
  t.deepEqual(await readInputs(bindingInputs), expectedBindings);

  await restartApp(t);
  await openHotkeys();
  t.deepEqual(await readInputs(labelInputs), names, 'A fresh app process restores all four names');
  t.deepEqual(await readInputs(bindingInputs), expectedBindings);
  const restartedApi = await getApiClient();
  const savedState = restartedApi.getResource<MarkersService>('MarkersService').state;
  t.deepEqual(
    markerIds.map(id => savedState[id]),
    names,
  );
});

test('Shows default marker names and follows name changes while Settings stays open', async t => {
  await openHotkeys();
  t.deepEqual(await readInputs(labelInputs), ['Marker 1', 'Marker 2', 'Marker 3', 'Marker 4']);

  const api = await getApiClient();
  const markers = api.getResource<MarkersService>('MarkersService');
  // Update saved state without typing into the inputs or remounting Settings.
  markerIds.forEach((id, i) => markers.setMarkerName(id, names[i]));

  await getClient().waitUntil(
    async () => (await readInputs(labelInputs)).every((name, i) => name === names[i]),
    { timeoutMsg: 'Marker inputs did not update from saved state while Settings was open' },
  );
  t.deepEqual(await readInputs(labelInputs), names);
});
