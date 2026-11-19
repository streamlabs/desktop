import { AudioService, HotkeysService, KeyListenerService, ScenesService } from 'app-services';
import { SourcesService } from 'services/api/external-api/sources';
import { IHotkey } from 'services/hotkeys';
import { EMonitoringType } from '../../../obs-api';
import { getApiClient } from '../../helpers/api-client';
import {
  clickIfDisplayed,
  clickTab,
  closeWindow,
  focusChild,
  focusWindow,
  getClient,
  getNumElements,
  isDisplayed,
  selectElements,
  waitForDisplayed,
} from '../../helpers/modules/core';
import { toggleDualOutputMode } from '../../helpers/modules/dual-output';
import { showSettingsWindow } from '../../helpers/modules/settings/settings';
import { logIn } from '../../helpers/modules/user';
import { SceneBuilder } from '../../helpers/scene-builder';
import { sleep } from '../../helpers/sleep';
import { restartApp, test, TExecutionContext, useWebdriver } from '../../helpers/webdriver';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('Populates essential hotkeys for them to be bound', async t => {
  const { app } = t.context;

  await openHotkeySettings(t);

  t.true(await isDisplayed('h2=Mic/Aux'));
  const micAuxKey = await app.client.$('h2=Mic/Aux');
  await micAuxKey.waitForExist();
  await micAuxKey.click();

  for (const hotkey of [
    'Start Streaming',
    'Stop Streaming',
    'Start Recording',
    'Stop Recording',
    'Enable Studio Mode',
    'Disable Studio Mode',
    'Transition (Studio Mode)',
    'Save Replay',
    'Screenshot Output',
    'Mute',
    'Unmute',
    'Push to Mute',
    'Push to Talk',
    'Enable Audio Monitoring',
    'Disable Audio Monitoring',
  ]) {
    const hotkeyLabel = await app.client.$(`label=${hotkey}`);

    t.true(await hotkeyLabel.isExisting(), `Hotkey for ${hotkey} was not found`);
  }
});

test('Audio monitoring shortcuts update the mixer and persist per source', async t => {
  const api = await getApiClient();
  const sources = api.getResource<SourcesService>('SourcesService');
  const micId = sources.getSourcesByName('Mic/Aux')[0].sourceId;
  const otherId = sources.createSource('Other audio', 'ffmpeg_source').sourceId;
  const imageId = sources.createSource('Still image', 'image_source').sourceId;
  const hotkeys = api.getResource<HotkeysService>('HotkeysService');
  const perSource = hotkeys.getHotkeysSet().sources;
  const enable = perSource[micId].find(h => h.actionName === 'MONITOR_ON');
  const disable = perSource[micId].find(h => h.actionName === 'MONITOR_OFF');
  t.deepEqual(enable.bindings, []);
  t.deepEqual(disable.bindings, []);
  t.false(
    (perSource[imageId] || []).some(h => ['MONITOR_ON', 'MONITOR_OFF'].includes(h.actionName)),
  );

  function bind(action: IHotkey, key: string) {
    t.true(
      hotkeys.editBinding(action, {
        type: 'set',
        index: 0,
        binding: { key, modifiers: { ctrl: false, alt: false, shift: false, meta: false } },
      }),
    );
  }

  async function press(key: string) {
    await focusWindow('worker');
    await getClient().execute(key => {
      const listener: KeyListenerService = (window as any).servicesManager.getResource(
        'KeyListenerService',
      );
      const binding = Object.values(listener.bindings)
        .map(namespaces => namespaces.global)
        .find(b => b?.key === key && b.eventType === 'registerKeydown');
      if (!binding) throw new Error(`Missing keydown binding for ${key}`);
      binding.callback();
      return new Promise<void>(resolve => setTimeout(resolve, 0));
    }, key);
  }

  async function mode(id: string) {
    await focusWindow('worker');
    return getClient().execute(id => {
      const audio: AudioService = (window as any).servicesManager.getResource('AudioService');
      const source = audio.views.getSource(id);
      return [source.monitoringType, source.source.getObsInput().monitoringType];
    }, id);
  }

  async function mixerShows(expected: EMonitoringType) {
    await focusChild();
    await (
      await getClient().$(`[data-name="monitoringType"][data-value="${expected}"]`)
    ).waitForDisplayed();
  }

  const off = EMonitoringType.None;
  const only = EMonitoringType.MonitoringOnly;
  const both = EMonitoringType.MonitoringAndOutput;
  bind(enable, 'F8');
  bind(disable, 'F9');
  const otherMode = await mode(otherId);
  await api.request('AudioService', 'showAdvancedSettings', micId);
  await mixerShows(off);
  await press('F8');
  await mixerShows(both);
  t.deepEqual(await mode(micId), [both, both]);
  t.deepEqual(await mode(otherId), otherMode);

  await focusChild();
  await (await getClient().$('button=Test Audio')).click();
  await mixerShows(only);
  await (await getClient().$('button=Testing...')).click();
  await mixerShows(both);
  await (await getClient().$('button=Test Audio')).click();
  await mixerShows(only);
  await press('F8');
  t.deepEqual(await mode(micId), [only, only]);
  await press('F9');
  await mixerShows(off);
  await (await getClient().$('button=Test Audio')).waitForDisplayed();
  await closeWindow('child');
  t.deepEqual(await mode(micId), [off, off]);

  bind(disable, 'F8');
  await press('F8');
  t.deepEqual(await mode(micId), [both, both]);
  await restartApp(t);
  t.deepEqual(await mode(micId), [both, both]);
  await press('F8');
  t.deepEqual(await mode(micId), [off, off]);
});

test('Binds a hotkey', async t => {
  const { app } = t.context;

  // Control+B
  const BINDING = '\uE009b';

  await openHotkeySettings(t);

  const bindingEl = async (root = app) =>
    await root.client.$('[data-testid=Start_Recording] [data-name=binding]');

  const getBinding = async (root = app) => (await bindingEl(root)).getValue();

  const doneButton = app.client.$('button=Close');

  // Bind a hotkey to Start Recording
  await bindingEl().then(el => el.click());

  await app.client.keys(BINDING);
  await doneButton.click();

  // Check that the binding persisted
  await openHotkeySettings(t);
  let binding = await getBinding();

  // New hotkey bind inputs have a suffix for re-binding
  const expectedBinding = 'Ctrl+B (Click to re-bind)';
  //
  t.is(binding, expectedBinding);

  // check hotkey exists after restart
  const restartedApp = await restartApp(t);
  await openHotkeySettings(t);

  binding = await getBinding(restartedApp);
  t.is(binding, expectedBinding);
});

const openHotkeySettings = async (t: TExecutionContext) => {
  await showSettingsWindow('Hotkeys', async () => {
    const startStreamingHotkey = await t.context.app.client.$('[data-testid=Start_Streaming]');
    await startStreamingHotkey.waitForExist();
  });
};

test('Shows and filters scene item hotkeys', async t => {
  await logIn();

  // confirm single output scene collection scene item hotkeys

  const client = await getApiClient();
  const sceneBuilder = new SceneBuilder(client);
  sceneBuilder.build(`
    Folder1
    Folder2
      Item1: image
      Item2: browser_source
    Folder3
      Item3:
   `);

  await showSettingsWindow('Hotkeys');

  await clickIfDisplayed('div.ant-collapse-item');

  let numHorizontalIcons = (await selectElements('i.icon-desktop')).values.length;
  let numVerticalIcons = (await selectElements('i.icon-phone-case')).values.length;

  t.true(
    numHorizontalIcons === 0,
    'Single output scene collection should have no horizontal icons',
  );
  t.true(numVerticalIcons === 0, 'Single output scene collection should have no vertical icons');

  // confirm dual output scene collection scene item hotkeys
  await toggleDualOutputMode();
  await showSettingsWindow('Hotkeys');
  await clickIfDisplayed('div.ant-collapse-item');
  await waitForDisplayed('div.section-content--opened');

  // wait for icons to load
  await sleep(500);

  await waitForDisplayed('i.icon-desktop');

  const activeSceneId = client.getResource<ScenesService>('ScenesService').state.activeSceneId;
  const hotkeys = client.getResource<HotkeysService>('HotkeysService').getHotkeysSet().scenes[
    activeSceneId
  ];

  const numHorizontalHotkeys = hotkeys
    .filter((hotkey: IHotkey) => hotkey?.display === 'horizontal')
    .map((hotkey: IHotkey) => hotkey).length;

  const numVerticalHotkeys = hotkeys
    .filter((hotkey: IHotkey) => hotkey?.display === 'vertical')
    .map((hotkey: IHotkey) => hotkey).length;

  // confirm only horizontal icons show in the horizontal tab
  // subtract 1 from horizontal because an icon is shown in the tab
  // subract 2 from vertical due to the mobile settings tab using this icon
  numHorizontalIcons = (await getNumElements('.icon-desktop')) - 1;
  numVerticalIcons = (await getNumElements('.icon-phone-case')) - 2;

  // confirm only horizontal icons show in the horizontal tab
  t.is(
    numHorizontalIcons,
    numHorizontalHotkeys,
    'Dual output scene collection horizontal icons should equal horizontal hotkeys',
  );
  t.is(numVerticalIcons, 0, 'Dual output scene collection hides vertical icons in horizontal tab');

  // confirm only vertical icons show in the vertical tab
  await clickTab('Vertical');
  numHorizontalIcons = (await getNumElements('.icon-desktop')) - 1;
  numVerticalIcons = (await getNumElements('.icon-phone-case')) - 2;
  t.is(
    numVerticalIcons,
    numVerticalHotkeys,
    'Dual output scene collection vertical icons should equal vertical hotkeys',
  );
  t.is(numHorizontalIcons, 0, 'Dual output scene collection hides horizontal icon in vertical tab');

  // confirm horizontal and vertical scene items show when dual output is toggled off
  // on a dual output scene collection
  await toggleDualOutputMode(false);
  await showSettingsWindow('Hotkeys');
  await clickIfDisplayed('div.ant-collapse-item');
  await waitForDisplayed('div.section-content--opened');

  // subtract 1 because the SWITCH_TO_SCENE hotkey is not a scene item but is a scenes hotkey
  numHorizontalIcons = (await getNumElements('.icon-desktop')) - 1;
  numVerticalIcons = (await getNumElements('.icon-phone-case')) - 2;

  // confirm only horizontal icons show in the horizontal tab
  t.is(
    numHorizontalIcons,
    numHorizontalHotkeys,
    'Dual output scene collection in single output mode shows horizontal hotkeys in horizontal tab',
  );
  t.is(
    numVerticalIcons,
    0,
    'Dual output scene collection hides vertical hotkeys in horizontal tab',
  );

  await clickTab('Vertical');
  numHorizontalIcons = (await getNumElements('.icon-desktop')) - 1;
  numVerticalIcons = (await getNumElements('.icon-phone-case')) - 2;

  // confirm only vertical icons show in the vertical tab
  t.is(
    numHorizontalIcons,
    0,
    'Dual output scene collection hides horizontal hotkeys in vertical tab',
  );
  t.is(
    numVerticalIcons,
    numVerticalHotkeys,
    'Dual output scene collection shows vertical hotkeys in vertical tab',
  );
});
