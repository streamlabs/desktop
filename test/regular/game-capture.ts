/**
 * Game Capture compatibility UI and capture behaviour.
 *
 * The compatibility message is derived from the `window` setting string alone, so most of these
 * are hermetic — no process, no GPU. The last two need a real capture target and use
 * summeroff/game-capture-target, which is downloaded on demand (see helpers/game-capture-target).
 *
 * Each test keeps the properties window open for as short a time as possible: holding it open
 * against a compat-matching window setting can wedge the app (see the tracking issue for the
 * refresh storm). Frame polling therefore happens with properties closed.
 *
 * Set SLOBS_TEST_SKIP_GAME_CAPTURE=1 to skip the two capture tests on an agent with no GPU or
 * interactive desktop session.
 */
import { useWebdriver, test } from '../helpers/webdriver';
import {
  addSource,
  clickRemoveSource,
  clickSourceProperties,
  selectSource,
} from '../helpers/modules/sources';
import {
  closeWindow,
  focusChild,
  focusMain,
  getClient,
  waitForDisplayed,
} from '../helpers/modules/core';
import { getApiClient } from '../helpers/api-client';
import { SourcesService } from '../../app/services/api/external-api/sources';
import { sleep } from '../helpers/sleep';
import { buildWindowSetting, launchProfile, stopAll } from '../helpers/game-capture-target';

useWebdriver({ restartAppAfterEachTest: false });

const skipCapture = process.env.SLOBS_TEST_SKIP_GAME_CAPTURE === '1';
const captureTest = skipCapture ? test.skip : test;

// Real compatibility.json entries. These need no running process — window_changed_callback
// matches on the setting string, not on a live window.
const CS2 = buildWindowSetting('Counter-Strike 2', 'FakeGameWindowClass', 'cs2.exe');
const DESTINY2 = buildWindowSetting('Destiny 2', 'FakeGameWindowClass', 'destiny2.exe');
const TERRARIA = buildWindowSetting('Terraria', 'FakeGameWindowClass', 'terraria.exe');
// matched on exe + a *prefix* of the title, so the version suffix must not prevent a match
const MINECRAFT = buildWindowSetting('Minecraft 1.21', 'GLFW30', 'javaw.exe');
// matched on window class alone; the executable deliberately matches nothing
const CHROMIUM = buildWindowSetting('Some Chromium App', 'Chrome_WidgetWin_1', 'notagame.exe');

const COMPAT_SELECTOR = '[data-name="compat_info"]';

test.after.always(() => stopAll());

interface ICompatInfo {
  rendered: boolean;
  text: string;
  severity: string;
  borderColor: string;
  iconClass: string;
  codeCount: number;
  anchorCount: number;
  anchorHref: string;
  anchorRole: string;
  anchorTabIndex: number;
  rawMarkupVisible: boolean;
}

/** Reads the compat-info callout. Runs in the renderer, so it must not close over anything. */
function readCompatInfo() {
  const box = document.querySelector('[data-name="compat_info"]') as HTMLElement;
  if (!box) return { rendered: false } as any;
  const frame = box.querySelector('[data-severity]') as HTMLElement;
  const icon = box.querySelector('i') as HTMLElement;
  const anchors = Array.prototype.slice.call(box.querySelectorAll('a')) as HTMLAnchorElement[];
  return {
    rendered: true,
    text: box.innerText,
    severity: frame ? frame.getAttribute('data-severity') : null,
    // a transparent border would mean the severity class never applied
    borderColor: frame ? getComputedStyle(frame).borderTopColor : null,
    // the icon also carries a hashed CSS-module class; only the icon-font one is semantic
    iconClass: icon
      ? Array.prototype.slice.call(icon.classList).find((c: string) => c.indexOf('icon-') === 0)
      : null,
    codeCount: box.querySelectorAll('code').length,
    anchorCount: anchors.length,
    anchorHref: anchors.length ? anchors[0].getAttribute('href') : null,
    anchorRole: anchors.length ? anchors[0].getAttribute('role') : null,
    anchorTabIndex: anchors.length ? anchors[0].tabIndex : null,
    // the regression this suite exists for: markup must never be visible as text
    rawMarkupVisible: /<code>|<\/code>|<br>|<a href/.test(box.innerText),
  };
}

/**
 * Applies settings to a source through the external API.
 * Never return an API proxy out of an async function — awaiting it invokes `then` on the proxy
 * and the IPC layer answers METHOD_NOT_FOUND.
 */
async function updateSettings(name: string, settings: Dictionary<any>) {
  const api = await getApiClient();
  const sourcesService = api.getResource<SourcesService>('SourcesService');
  sourcesService.getSourcesByName(name)[0].updateSettings(settings);
}

async function readDimensions(name: string) {
  const api = await getApiClient();
  const sourcesService = api.getResource<SourcesService>('SourcesService');
  const source = sourcesService.getSourcesByName(name)[0];
  return { width: source.width, height: source.height };
}

async function removeGameCapture(name: string) {
  try {
    await focusMain();
    await clickRemoveSource(name);
  } catch (e: unknown) {
    console.log(`cleanup of "${name}" failed:`, e);
  }
}

/**
 * Opens the properties window, reads the callout, and closes it again immediately.
 * `expectMessage` lets us wait on the element instead of sleeping when one is expected.
 */
async function readCompatInfoFor(name: string, expectMessage = true): Promise<ICompatInfo> {
  await focusMain();
  await selectSource(name);
  await clickSourceProperties(name);
  try {
    await focusChild();
    await waitForDisplayed('label=Mode');
    if (expectMessage) {
      await waitForDisplayed(COMPAT_SELECTOR, { timeout: 10000 });
    } else {
      await sleep(1500);
    }
    return (await getClient().execute(readCompatInfo)) as ICompatInfo;
  } finally {
    await closeWindow('child');
    await focusMain();
  }
}

/** Adds a Game Capture source, reads its callout once, and removes the source again. */
async function probeCompat(
  name: string,
  settings: Dictionary<any>,
  expectMessage = true,
): Promise<ICompatInfo> {
  await addSource('Game Capture', name);
  try {
    if (settings) {
      await updateSettings(name, settings);
      await sleep(1000);
    }
    return await readCompatInfoFor(name, expectMessage);
  } finally {
    await removeGameCapture(name);
  }
}

test('Game Capture compat warning renders as rich text with an accessible link', async t => {
  const info = await probeCompat('GC rich text', { capture_mode: 'window', window: CS2 });

  t.true(info.rendered, 'compatibility message should be shown');
  t.false(info.rawMarkupVisible, `raw markup visible as text: ${info.text}`);
  t.is(info.codeCount, 1, 'launch option should render as a <code> element');
  t.true(info.text.includes('-allow_third_party_software'), 'launch option should be present');

  t.is(info.anchorCount, 1, 'help URL should render as a link');
  // an href would let ctrl/middle-click navigate the properties window away
  t.is(info.anchorHref, null, 'link must not carry an href');
  t.is(info.anchorRole, 'link', 'link needs an explicit role without an href');
  t.is(info.anchorTabIndex, 0, 'link must be focusable');

  t.is(info.iconClass, 'icon-information', 'Warning severity uses the information icon');
  t.is(info.severity, 'warning');
  t.not(info.borderColor, 'rgba(0, 0, 0, 0)', 'severity styling did not apply');
});

test('Game Capture compat message uses Error styling', async t => {
  const info = await probeCompat('GC error sev', { capture_mode: 'window', window: DESTINY2 });

  t.true(info.rendered);
  t.is(info.iconClass, 'icon-error');
  t.is(info.severity, 'error');
  t.not(info.borderColor, 'rgba(0, 0, 0, 0)', 'severity styling did not apply');
});

test('Game Capture compat message uses Normal styling', async t => {
  const info = await probeCompat('GC normal sev', { capture_mode: 'window', window: TERRARIA });

  t.true(info.rendered);
  t.is(info.iconClass, 'icon-question');
  t.is(info.severity, 'normal');
  t.not(info.borderColor, 'rgba(0, 0, 0, 0)', 'severity styling did not apply');
});

test('Game Capture compat matches on a title prefix', async t => {
  const info = await probeCompat('GC title prefix', { capture_mode: 'window', window: MINECRAFT });

  t.true(info.rendered, 'a title-prefix entry should still match with a version suffix');
  t.true(info.text.includes('Minecraft'), info.text);
  t.is(info.severity, 'normal');
  t.false(info.rawMarkupVisible, info.text);
});

test('Game Capture compat matches on window class alone', async t => {
  const info = await probeCompat('GC class match', { capture_mode: 'window', window: CHROMIUM });

  t.true(info.rendered, 'a class-only entry should match even when the exe does not');
  t.true(info.text.includes('Chromium'), info.text);
  t.is(info.severity, 'error');
  // this entry carries no URL, so the renderer must cope with a message that has no link
  t.is(info.anchorCount, 0, 'entry has no URL, so no link should be rendered');
  t.false(info.rawMarkupVisible, info.text);
});

test('Game Capture hides the transient hook status', async t => {
  // libobs leaves "Attempting to hook process..." visible permanently because compat_info is
  // registered twice in game-capture.c and the visibility logic no-ops on a NULL property
  const info = await probeCompat('GC hook status', null, false);

  if (info.rendered) {
    t.false(
      info.text.includes('Attempting to hook process'),
      'the never-clearing hook placeholder should not be shown',
    );
  } else {
    t.pass();
  }
});

test('Game Capture hides an empty compat message', async t => {
  // in any_fullscreen mode the property stays visible with an empty description
  const info = await probeCompat('GC empty', { capture_mode: 'any_fullscreen' }, false);
  t.false(info.rendered, 'an empty compatibility message should render nothing at all');
});

captureTest('Game Capture lists and captures a live window', async t => {
  // cs2 and cs2-blocked are indistinguishable to OBS (same title, class and exe), so only one
  // target may be running at a time or a test can hook the other one's window
  stopAll();
  const target = await launchProfile('cs2');
  const name = 'GC live capture';

  await addSource('Game Capture', name);
  try {
    await updateSettings(name, { capture_mode: 'window', window: target.obsWindowSetting });

    const api = await getApiClient();
    const sourcesService = api.getResource<SourcesService>('SourcesService');
    const formData = sourcesService.getSourcesByName(name)[0].getPropertiesFormData() as any[];
    const windowProp = formData.find(f => f.name === 'window');
    const listed = (windowProp.options || []).some((o: any) => o.value === target.obsWindowSetting);
    t.true(listed, 'the target window should appear in the window property options');

    // the target reports the hook from inside its own process, which is unambiguous; Game
    // Capture shows a placeholder at its own size when it is not capturing, so the source's
    // dimensions alone cannot tell the two apart
    const hooked = await target.waitForEvent('hooked', 30000);
    t.truthy(
      hooked,
      'target never reported being hooked — the agent may lack a GPU or an interactive session',
    );

    // and the frames that arrive are actually its own
    let dimensions = '0x0';
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const { width, height } = await readDimensions(name);
      dimensions = `${width}x${height}`;
      if (dimensions === target.clientSize) break;
      await sleep(1000);
    }
    t.is(dimensions, target.clientSize, `source never matched the target's ${target.clientSize}`);
  } finally {
    await removeGameCapture(name);
    stopAll();
  }
});

captureTest('Game Capture survives the target recreating its D3D device', async t => {
  stopAll();
  // scheduled relative to the hook: an absolute delay races OBS, which needs several seconds to
  // inject, so the recreate would otherwise fire before there is anything to disturb
  const target = await launchProfile('cs2', {
    extraArgs: ['--recreate-device-after', 'hooked+3'],
  });
  const name = 'GC churn recovery';

  await addSource('Game Capture', name);
  try {
    await updateSettings(name, { capture_mode: 'window', window: target.obsWindowSetting });

    const hooked = await target.waitForEvent('hooked', 40000);
    t.truthy(hooked, 'target was never hooked, so there was nothing to disturb');

    const recreated = await target.waitForEvent(
      'device_recreated',
      30000,
      target.events.indexOf(hooked) + 1,
    );
    t.truthy(recreated, 'the scheduled device recreate never fired');

    // Frames must still be arriving afterwards. The placeholder has a different size, so
    // matching the target's client area is the signal that they are real.
    // Note: no `unhooked` fires here — the hook DLL stays loaded across in-process churn and
    // re-acquires the new device, so don't expect an unhook/rehook cycle to assert on.
    let dimensions = '0x0';
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const { width, height } = await readDimensions(name);
      dimensions = `${width}x${height}`;
      if (dimensions === target.clientSize) break;
      await sleep(1000);
    }
    t.is(dimensions, target.clientSize, 'capture stopped after the device was recreated');
  } finally {
    await removeGameCapture(name);
    stopAll();
  }
});

captureTest('Game Capture warns and refuses capture when injection is blocked', async t => {
  // reproduces CS2 launched without -allow_third_party_software: the hook cannot load
  stopAll();
  const target = await launchProfile('cs2-blocked');
  const name = 'GC blocked capture';

  // the target self-verifies that the block is actually armed, so a block that silently stops
  // working fails here instead of quietly turning this into a no-op test
  const block = target.events.find(e => e.event === 'block_active');
  t.truthy(block, 'target did not report an armed capture block');
  t.true(block.verified, `block ${block.mode} could not be verified: ${block.detail}`);

  await addSource('Game Capture', name);
  try {
    await updateSettings(name, { capture_mode: 'window', window: target.obsWindowSetting });

    const hooked = await target.waitForEvent('hooked', 20000);
    t.falsy(hooked, 'a blocked target must never be hooked');

    const { width, height } = await readDimensions(name);
    t.not(
      `${width}x${height}`,
      target.clientSize,
      'a blocked target must never produce frames',
    );

    const info = await readCompatInfoFor(name);
    t.true(info.rendered, 'the compatibility warning should still be shown while blocked');
    t.false(info.rawMarkupVisible, 'raw markup visible as text');
  } finally {
    await removeGameCapture(name);
    stopAll();
  }
});
