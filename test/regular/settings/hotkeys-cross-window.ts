import { HotkeysService, KeyListenerService } from 'app-services';
import { IHotkey } from 'services/hotkeys';
import { getApiClient } from '../../helpers/api-client';
import { focusWindow, getClient } from '../../helpers/modules/core';
import { showPage } from '../../helpers/modules/navigation';
import { showSettingsWindow } from '../../helpers/modules/settings/settings';
import { test, useWebdriver } from '../../helpers/webdriver';

// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

const highlighterInput = '[data-testid="highlighter-replay-hotkey"] input';
const settingsRow = '[data-testid="Save_Replay"]';
const settingsInputs = `${settingsRow} input[data-name="binding"]`;
const replay: IHotkey = { actionName: 'SAVE_REPLAY', bindings: [] };
const binding = (digit: string) => ({
  key: `Digit${digit}`,
  modifiers: { ctrl: true, alt: false, shift: false, meta: false },
});

async function activate(windowId: string) {
  if (!(await focusWindow(windowId))) throw new Error(`Missing ${windowId} window`);
  await getClient().execute(() => require('@electron/remote').getCurrentWindow().focus());
}

async function showHighlighter() {
  // The navigation menu requires an account for Highlighter, but these local
  // replay controls do not. Navigate through the real service without a pooled account.
  await (await getApiClient()).request('NavigationService', 'navigate', 'Highlighter');
  await activate('main');
  await (await getClient().$(highlighterInput)).waitForDisplayed({ timeout: 10000 });
}

async function openEditors() {
  await showHighlighter();
  await showSettingsWindow('Hotkeys');
  await activate('child');
  await (await getClient().$(settingsInputs)).waitForDisplayed();
}

async function bind(selector: string, digit: string, index = 0) {
  const inputs = await getClient().$$(selector);
  await inputs[index].click();
  await getClient().keys(['\uE009', digit, '\uE000']);
}

async function expectBindings(selector: string, digits: string[]) {
  const expected = digits.map(digit =>
    digit ? `Ctrl+${digit} (Click to re-bind)` : 'Click to bind',
  );
  await getClient().waitUntil(
    async () => {
      const inputs = await getClient().$$(selector);
      const values = await Promise.all(inputs.map(input => input.getValue()));
      return JSON.stringify(values) === JSON.stringify(expected);
    },
    { timeout: 10000, timeoutMsg: `Expected ${selector} to display ${expected.join(', ')}` },
  );
}

async function hotkeys() {
  return { service: (await getApiClient()).getResource<HotkeysService>('HotkeysService') };
}

async function expectRegistered(digits: string[]) {
  const listener = (await getApiClient()).getResource<KeyListenerService>('KeyListenerService');
  await getClient().waitUntil(
    () => {
      const registered = Object.values(listener.bindings)
        .map(namespaces => namespaces.global)
        .filter(b => b?.eventType === 'registerKeydown' && b.modifiers.ctrl)
        .map(b => b.key)
        .sort();
      return JSON.stringify(registered) === JSON.stringify(digits.map(d => `Digit${d}`).sort());
    },
    { timeout: 10000, timeoutMsg: `Expected registered Ctrl hotkeys: ${digits.join(', ')}` },
  );
}

test('Highlighter and Settings synchronize replay hotkeys in both directions', async t => {
  await showHighlighter();
  await activate('main');
  await bind(highlighterInput, '1');
  await expectBindings(highlighterInput, ['1']);
  await showSettingsWindow('Hotkeys');
  await activate('child');
  await expectBindings(settingsInputs, ['1']);

  // Keep the same Settings component mounted while the main window edits it.
  await activate('main');
  await bind(highlighterInput, '2');
  await activate('child');
  await expectBindings(settingsInputs, ['2']);

  // The gear recreates the already-open child contents. Cleanup must not save a snapshot.
  await showSettingsWindow('Hotkeys');
  await activate('child');
  await expectBindings(settingsInputs, ['2']);
  await bind(settingsInputs, '3');
  await expectBindings(settingsInputs, ['3']);
  await activate('main');
  await expectBindings(highlighterInput, ['3']);

  // A prior Highlighter edit must not be replayed by an ordinary focus/blur.
  await (await getClient().$(highlighterInput)).click();
  await getClient().execute(() => (document.activeElement as HTMLElement).blur());
  await expectRegistered(['3']);
  await showPage('Editor');
  await showHighlighter();
  await expectBindings(highlighterInput, ['3']);
  await activate('child');
  await (await getClient().$('button=Close')).click();
  t.is((await hotkeys()).service.getGeneralHotkeyByName('SAVE_REPLAY').bindings[0].key, 'Digit3');
});

test('Highlighter preserves additional replay bindings and unrelated Settings edits', async t => {
  await openEditors();
  await bind(settingsInputs, '1');
  await (await getClient().$(`${settingsRow} [data-testid="add-binding"]`)).click();
  await expectBindings(settingsInputs, ['1', '']);
  await bind(settingsInputs, '9', 1);
  await bind('[data-testid="Start_Recording"] input', '7');
  await activate('main');
  await bind(highlighterInput, '2');
  await activate('child');
  await expectBindings(settingsInputs, ['2', '9']);
  await expectBindings('[data-testid="Start_Recording"] input', ['7']);
  const { service } = await hotkeys();
  t.deepEqual(service.getGeneralHotkeyByName('SAVE_REPLAY').bindings, [binding('2'), binding('9')]);

  // Removing the primary binding promotes the other one in both windows.
  await (await getClient().$(`${settingsRow} [data-testid="remove-binding"]`)).click();
  await expectBindings(settingsInputs, ['9']);
  await activate('main');
  await expectBindings(highlighterInput, ['9']);
  await activate('child');
  await (await getClient().$(`${settingsRow} [data-testid="remove-binding"]`)).click();
  await expectBindings(settingsInputs, ['']);
  await activate('main');
  await expectBindings(highlighterInput, ['']);
  t.deepEqual(service.getGeneralHotkeyByName('SAVE_REPLAY').bindings, []);
  await expectRegistered(['7']);
});

test('Hotkey capture cleans up on key release, window blur, navigation and Settings close', async t => {
  await openEditors();
  await activate('main');
  await bind(highlighterInput, '1');
  await expectRegistered(['1']);

  await (await getClient().$(highlighterInput)).click();
  await expectRegistered([]);
  const { service } = await hotkeys();
  service.bindHotkeys();
  await expectRegistered([]);

  // Hold the key down: capture must suppress registration until keyup.
  await getClient().performActions([
    {
      type: 'key',
      id: 'capture',
      actions: [
        { type: 'keyDown', value: '\uE009' },
        { type: 'keyDown', value: '2' },
      ],
    },
  ]);
  await expectRegistered([]);
  await getClient().releaseActions();
  await expectBindings(highlighterInput, ['2']);
  await expectRegistered(['2']);

  await (await getClient().$(highlighterInput)).click();
  await expectRegistered([]);
  await activate('child');
  await expectRegistered(['2']);
  await (await getClient().$(settingsInputs)).click();
  await expectRegistered([]);
  await activate('main');
  await expectRegistered(['2']);

  await (await getClient().$(highlighterInput)).click();
  await expectRegistered([]);
  await showPage('Editor');
  await expectRegistered(['2']);
  await activate('child');
  await (await getClient().$(settingsInputs)).click();
  await expectRegistered([]);
  // Close through the service while the field still owns capture, exercising unmount.
  await (await getApiClient()).request('WindowsService', 'closeChildWindow');
  await expectRegistered(['2']);
  t.deepEqual(service.getGeneralHotkeyByName('SAVE_REPLAY').bindings, [binding('2')]);
});

test('Hotkey capture tokens preserve other owners and restore the latest bindings', async t => {
  const { service } = await hotkeys();
  service.editBinding(replay, { type: 'set', index: 0, binding: binding('1') });
  await expectRegistered(['1']);
  try {
    service.beginCapture('first-test-editor');
    service.beginCapture('second-test-editor');
    service.beginCapture('second-test-editor');
    service.endCapture('first-test-editor');
    service.endCapture('first-test-editor');
    service.editBinding(replay, { type: 'set', index: 0, binding: binding('2') });
    service.bindHotkeys();
    await expectRegistered([]);
  } finally {
    service.endCapture('first-test-editor');
    service.endCapture('second-test-editor');
  }
  await expectRegistered(['2']);
  t.false(service.editBinding(replay, { type: 'remove', index: 5 }));
  t.deepEqual(service.getGeneralHotkeyByName('SAVE_REPLAY').bindings, [binding('2')]);
});

test('Unmounting a hotkey input releases capture after a delayed acquisition response', async t => {
  await showHighlighter();
  await focusWindow('worker');
  await getClient().execute(() => {
    const service = (window as any).servicesManager.getResource('HotkeysService');
    const original = service.beginCapture;
    let finish = () => {};
    (window as any).finishTestCapture = () => {
      service.beginCapture = original;
      finish();
      delete (window as any).finishTestCapture;
    };
    service.beginCapture = (token: string) => {
      original.call(service, token);
      return new Promise<void>(resolve => {
        finish = resolve;
      });
    };
  });
  const { service } = await hotkeys();
  try {
    service.editBinding(replay, { type: 'set', index: 0, binding: binding('1') });
    await activate('main');
    await (await getClient().$(highlighterInput)).click();
    await expectRegistered([]);
    await showPage('Editor');
  } finally {
    await focusWindow('worker');
    await getClient().execute(() => (window as any).finishTestCapture());
    await activate('main');
  }
  await expectRegistered(['1']);
  t.deepEqual(service.getGeneralHotkeyByName('SAVE_REPLAY').bindings, [binding('1')]);
});
