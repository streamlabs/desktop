import { restartApp, test, TExecutionContext, useWebdriver } from '../../helpers/webdriver';
import {
  click,
  clickCheckbox,
  clickIfDisplayed,
  clickTab,
  focusChild,
  focusMain,
  getNumElements,
  isDisplayed,
  selectElements,
  waitForDisplayed,
} from '../../helpers/modules/core';
import { toggleDualOutputMode } from '../../helpers/modules/dual-output';
import { logIn } from '../../helpers/modules/user';
import { showSettingsWindow } from '../../helpers/modules/settings/settings';
import { getApiClient } from '../../helpers/api-client';
import { SceneBuilder } from '../../helpers/scene-builder';
import { sleep } from '../../helpers/sleep';
import { HotkeysService, ScenesService } from 'app-services';
import { IHotkey } from 'services/hotkeys';

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
    'Mute',
    'Unmute',
    'Push to Mute',
    'Push to Talk',
  ]) {
    const hotkeyLabel = await app.client.$(`label=${hotkey}`);

    t.true(await hotkeyLabel.isExisting(), `Hotkey for ${hotkey} was not found`);
  }
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
  const { app } = t.context;
  await focusMain();
  await (await app.client.$('.side-nav .icon-settings')).click();

  await focusChild();

  // Wait for hotkeys to populate
  await (await app.client.$('li=Hotkeys')).click();
  const startStreamingHotkey = await app.client.$('[data-testid=Start_Streaming]');
  await startStreamingHotkey.waitForExist();
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
  await toggleDualOutputMode(false);
  await focusChild();
  await click('[data-name="settings-nav-item"]=Hotkeys');
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
  await click('[data-name="settings-nav-item"]=Video');
  await clickCheckbox('dual-output-checkbox');
  await click('[data-name="settings-nav-item"]=Hotkeys');
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
