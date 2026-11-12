import { test, restartApp, useWebdriver } from '../helpers/webdriver';
import {
  clickButton,
  click,
  focusMain,
  focusWindow,
  getClient,
  isDisplayed,
  waitForDisplayed,
} from '../helpers/modules/core';

// This is the test harness, not a React hook.
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

interface ILayoutSnapshot {
  version?: number;
  layoutEditorUsed?: boolean;
  currentLayout: string;
  dockLayout: string;
  dockResize: number;
  layoutCustomized?: boolean;
  dockCustomized?: boolean;
  slots: Record<string, string | null>;
  dockElements: string[];
  mainElements: string[];
  dockCollapsed: boolean;
}

/** Read the layout state from the worker, where the services run. */
async function layoutSnapshot(tab?: string): Promise<ILayoutSnapshot> {
  await focusWindow('worker');
  return getClient().execute((tab: string | undefined) => {
    const manager = (window as any).servicesManager;
    const layout = manager.getResource('LayoutService');
    const { state, views } = layout;
    const current = tab ? state.tabs[tab] : views.currentTab;
    const slots: Record<string, string | null> = {};
    Object.keys(current.slottedElements).forEach(el => {
      slots[el] = current.slottedElements[el]?.slot ?? null;
    });
    return {
      version: state.version,
      layoutEditorUsed: state.layoutEditorUsed,
      currentLayout: current.currentLayout,
      dockLayout: current.dockLayout,
      dockResize: current.dockResize,
      layoutCustomized: current.layoutCustomized,
      dockCustomized: current.dockCustomized,
      slots,
      // The views read the current tab, so they are only meaningful when no tab was requested
      dockElements: tab ? [] : [...views.dockElements],
      mainElements: tab ? [] : [...views.mainElementsToRender],
      dockCollapsed: manager.getResource('CustomizationService').state.dockCollapsed,
    };
  }, tab);
}

/**
 * Seed the persisted layout state, then restart so the service migrates it on init.
 * The state is written right before the restart so that nothing overwrites it.
 */
async function restartWithPersistedLayout(t: any, persisted: object) {
  t.true(await focusWindow('worker'));
  await getClient().execute((persisted: object) => {
    const Service = (window as any).servicesManager.getResource('LayoutService').constructor;
    localStorage.setItem(Service.localStorageKey, JSON.stringify(persisted));
  }, persisted);
  await restartApp(t);
}

/**
 * Drop an element on a target like the user does. WebDriver can't drive HTML5 drag and drop,
 * but the editor only needs the position of the `dragend` event, which it resolves to the zone
 * under it with `document.elementFromPoint`.
 */
async function dragTo(sourceSelector: string, targetSelector: string) {
  await getClient().execute(
    (source: string, target: string) => {
      const rect = document.querySelector(target)!.getBoundingClientRect();
      document.querySelector(source)!.dispatchEvent(
        new DragEvent('dragend', {
          bubbles: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        }),
      );
    },
    sourceSelector,
    targetSelector,
  );
}

async function zoneText(selector: string) {
  return (await getClient().$(selector)).getText();
}

test('A fresh install starts on the stacked dock without announcing it', async t => {
  const snapshot = await layoutSnapshot();

  t.is(snapshot.version, 2);
  t.falsy(snapshot.layoutEditorUsed);
  t.is(snapshot.currentLayout, 'Default');
  t.is(snapshot.dockLayout, 'Stacked');
  t.deepEqual(snapshot.dockElements, ['Minifeed', 'Multichat']);
  t.deepEqual(snapshot.mainElements, ['Display', 'Scenes', 'Sources', 'Mixer']);
  t.false(snapshot.dockCollapsed, 'The Mini Feed in the dock starts it expanded');

  t.true(
    await getClient().execute(() => {
      const manager = (window as any).servicesManager;
      return !manager.getResource('DismissablesService').views.shouldShow('dock_layouts');
    }),
    'Fresh installs have nothing new to announce',
  );

  await focusMain();
  await waitForDisplayed('[data-testid=dock-chevron-opened]');
  t.false(await isDisplayed('div*=New: Dock Layouts'));
});

test('Upgrading a persisted layout from before the dock migrates it', async t => {
  // Only the differences from the previous defaults are persisted, so an empty state is a user
  // that never touched the layout.
  await restartWithPersistedLayout(t, {});
  let snapshot = await layoutSnapshot();

  t.is(snapshot.version, 2);
  t.falsy(snapshot.layoutEditorUsed, 'Renaming layouts is not the user using the editor');
  t.is(snapshot.currentLayout, 'TwoThenThree', 'The previous Default layout was renamed');
  t.is(snapshot.dockLayout, 'Single');
  t.is(snapshot.slots.Multichat, 'S1');
  t.is(snapshot.slots.Minifeed, '2');
  t.false(snapshot.layoutCustomized, 'The previous default is not customized');
  t.false(snapshot.dockCustomized);
  t.true(snapshot.dockCollapsed, 'A dock with only Multichat keeps starting collapsed');

  // A user that customized the layout, with a second tab from before the dock existed
  await restartWithPersistedLayout(t, {
    version: undefined,
    currentTab: 'default',
    tabs: {
      default: { currentLayout: 'Classic' },
      second: {
        name: 'Second',
        icon: 'icon-studio',
        currentLayout: 'Default',
        slottedElements: { Display: { slot: '1' }, Scenes: { slot: '2' } },
        resizes: { bar1: 156, bar2: 240 },
      },
    },
  });
  snapshot = await layoutSnapshot();

  t.is(snapshot.currentLayout, 'Default', 'Classic was renamed Default');
  t.true(snapshot.layoutEditorUsed, 'Customized layouts are attributed to the layout editor');
  t.true(snapshot.layoutCustomized, 'Its slots differ from the Default layout defaults');
  t.false(snapshot.dockCustomized);

  const second = await layoutSnapshot('second');
  t.is(second.currentLayout, 'TwoThenThree');
  t.is(second.dockLayout, 'Single', 'Tabs without a dock get one');
  t.is(second.dockResize, 0.5);
  t.is(second.slots.Multichat, 'S1', 'The dock holds what it did before it was configurable');
  t.true(second.layoutCustomized);
  t.false(second.dockCustomized);
});

test('Changing the main layout and the dock layout leave each other alone', async t => {
  await focusWindow('worker');
  const result = await getClient().execute(() => {
    const layout = (window as any).servicesManager.getResource('LayoutService');
    const dock = () => [...layout.views.dockElements];
    const main = () => [...layout.views.mainElementsToRender];
    const results: Record<string, string[]> = {};

    layout.changeLayout('FourByFour');
    results.afterMainChange = dock();
    results.mainAfterMainChange = main();

    layout.setSlots({
      Display: { slot: '1' },
      Minifeed: { slot: 'S1' },
      Multichat: { slot: 'S2' },
    });
    layout.setDockLayout('Single');
    results.afterDockChange = dock();
    results.mainAfterDockChange = main();
    results.multichatSlot = [String(layout.views.currentTab.slottedElements.Multichat.slot)];

    // Multichat can also be placed in the main layout
    layout.setSlots({ Display: { slot: '1' }, Multichat: { slot: '2' }, Minifeed: { slot: 'S1' } });
    results.dockWithMainMultichat = dock();
    results.mainWithMainMultichat = main();
    return results;
  });

  t.deepEqual(result.afterMainChange, ['Minifeed', 'Multichat'], 'The dock survives a new layout');
  t.deepEqual(result.mainAfterMainChange, [], 'The main slots are cleared by a new layout');
  t.deepEqual(result.afterDockChange, ['Minifeed']);
  t.deepEqual(result.mainAfterDockChange, ['Display']);
  t.deepEqual(result.multichatSlot, ['null'], 'Multichat lost its slot with the dock slot');
  t.deepEqual(result.dockWithMainMultichat, ['Minifeed']);
  t.deepEqual(result.mainWithMainMultichat, ['Display', 'Multichat']);
});

test('The layout editor edits the dock and places Multichat in the main layout', async t => {
  await focusWindow('worker');
  await getClient().execute(() => {
    (window as any).servicesManager.getResource('NavigationService').navigate('LayoutEditor');
  });
  await focusMain();

  const dockZones = '[data-name=dock-preview] [id^="S"]';
  await waitForDisplayed('[data-name=dock-preview]');
  t.is((await getClient().$$(dockZones)).length, 2);
  t.is(await zoneText('[data-name=dock-preview] [id="S1"]'), 'Mini Feed');
  t.is(await zoneText('[data-name=dock-preview] [id="S2"]'), 'Chat');
  t.is(
    await (await getClient().$('[data-name=dock-layout-stacked]')).getAttribute('aria-pressed'),
    'true',
  );

  await click('[data-name=dock-layout-single]');
  t.is((await getClient().$$(dockZones)).length, 1, 'The Single dock has one slot');
  t.is(await zoneText('[data-name=dock-preview] [id="S1"]'), 'Chat');
  t.is(await zoneText('[id="4"]'), 'Mini Feed', 'The untouched layout follows the Single defaults');

  // The Display is too large for the dock, so dropping it there changes nothing
  await dragTo('[id="1"]', '[data-name=dock-preview] [id="S1"]');
  t.is(await zoneText('[id="1"]'), 'Editor Display');
  t.is(await zoneText('[data-name=dock-preview] [id="S1"]'), 'Chat');

  // Chat can be dragged out of the dock into the main layout, swapping with the Scene Selector
  await dragTo('[data-name=dock-preview] [id="S1"]', '[id="2"]');
  t.is(await zoneText('[id="2"]'), 'Chat');

  await clickButton('Save Changes');
  // Saving is async and records the usage before navigating away, so wait for the editor to close
  await waitForDisplayed('[data-name=dock-preview]', { reverse: true });

  const snapshot = await layoutSnapshot();
  t.is(snapshot.dockLayout, 'Single');
  t.is(snapshot.slots.Multichat, '2');
  t.is(snapshot.slots.Display, '1');
  t.true(snapshot.layoutEditorUsed);
  t.deepEqual(snapshot.dockElements, ['Scenes']);
  t.true(snapshot.mainElements.includes('Multichat'));

  // Logged out, the element in the main layout explains why it has nothing to show
  await focusMain();
  await waitForDisplayed('span=Log in to use chat.');
});

async function leftDock(): Promise<boolean> {
  await focusWindow('worker');
  return getClient().execute(
    () => (window as any).servicesManager.getResource('CustomizationService').state.leftDock,
  );
}

test('The layout editor stages its changes until saved', async t => {
  const initialLeftDock = await leftDock();
  await getClient().execute(() => {
    (window as any).servicesManager.getResource('NavigationService').navigate('LayoutEditor');
  });
  await focusMain();
  await waitForDisplayed('[data-name=dock-preview]');
  t.false(await isDisplayed('[data-testid=dock-chevron-opened]'), 'The real dock is not rendered');

  // An element in a slot the smaller dock lacks comes back with the slot
  const stackedDock = '[data-name=dock-preview] [id="S2"]';
  await click('[data-name=dock-layout-single]');
  await click('[data-name=dock-layout-stacked]');
  t.is(await zoneText(stackedDock), 'Chat');

  await click(`[data-name=dock-position-${initialLeftDock ? 'right' : 'left'}]`);
  t.is(await leftDock(), initialLeftDock, 'The dock position is not applied before saving');

  await focusMain();
  await clickButton('Save Changes');
  t.is(await leftDock(), !initialLeftDock, 'Saving applies the dock position');
});

test('An untouched layout follows the dock layout, a customized one keeps its placements', async t => {
  await focusWindow('worker');
  await getClient().execute(() => {
    (window as any).servicesManager.getResource('NavigationService').navigate('LayoutEditor');
  });
  await focusMain();
  await waitForDisplayed('[data-name=dock-preview]');

  const dockTop = '[data-name=dock-preview] [id="S1"]';
  t.is(await zoneText('[id="4"]'), 'Audio Mixer');
  t.is(await zoneText(dockTop), 'Mini Feed');

  await click('[data-name=dock-layout-single]');
  t.is(await zoneText(dockTop), 'Chat');
  t.is(await zoneText('[id="4"]'), 'Mini Feed', 'Mini Feed moves out of the dock');

  await click('[data-name=dock-layout-stacked]');
  t.is(await zoneText(dockTop), 'Mini Feed', 'Mini Feed moves into the dock');
  t.is(await zoneText('[data-name=dock-preview] [id="S2"]'), 'Chat');
  t.is(await zoneText('[id="4"]'), 'Audio Mixer', 'The Mixer takes its place');

  // Swapping two elements customizes the layout, so only empty slots are filled from now on
  await dragTo('[id="2"]', '[id="3"]');
  await click('[data-name=dock-layout-single]');
  t.is(await zoneText(dockTop), 'Mini Feed');
  t.is(await zoneText('[id="4"]'), 'Audio Mixer');
});

test('A customized dock does not stop the main layout from following the defaults', async t => {
  await focusWindow('worker');
  await getClient().execute(() => {
    (window as any).servicesManager.getResource('NavigationService').navigate('LayoutEditor');
  });
  await focusMain();
  await waitForDisplayed('[data-name=dock-preview]');

  const dockTop = '[data-name=dock-preview] [id="S1"]';
  await click('[data-name=dock-layout-single]');
  await dragTo('[data-name=element-Browser]', dockTop);
  t.is(await zoneText(dockTop), 'Website');

  await click('[data-name=dock-layout-stacked]');
  t.is(await zoneText('[id="4"]'), 'Audio Mixer', 'The main layout follows the Stacked defaults');
  t.is(await zoneText(dockTop), 'Website', 'The customized dock is kept');
  t.is(await zoneText('[data-name=dock-preview] [id="S2"]'), 'Chat', 'The new slot is filled');
});

test('The Dock Layouts tip moves the untouched old default to the Default layout', async t => {
  await focusWindow('worker');
  await getClient().execute(() => {
    const manager = (window as any).servicesManager;
    const layout = manager.getResource('LayoutService');
    // The old default: TwoThenThree with the Mini Feed in the second slot and a Single dock
    layout.changeLayout('TwoThenThree');
    layout.setDockLayout('Single');
    layout.setSlots({
      Display: { slot: '1' },
      Minifeed: { slot: '2' },
      Scenes: { slot: '3' },
      Sources: { slot: '4' },
      Mixer: { slot: '5' },
      Multichat: { slot: 'S1' },
    });
    manager.getResource('NavigationService').navigate('LayoutEditor', { stageStackedDock: true });
  });
  await focusMain();
  await waitForDisplayed('[data-name=dock-preview]');

  t.is(await zoneText('[data-name=dock-preview] [id="S1"]'), 'Mini Feed');
  t.is(await zoneText('[data-name=dock-preview] [id="S2"]'), 'Chat');
  t.is(await zoneText('[id="2"]'), 'Scene Selector');
  t.is(await zoneText('[id="4"]'), 'Audio Mixer');

  await clickButton('Save Changes');
  t.is((await layoutSnapshot()).currentLayout, 'Default');
});

test('The Dock Layouts tip moves Mini Feed and Chat into the dock of a customized layout', async t => {
  await focusWindow('worker');
  await getClient().execute(() => {
    const manager = (window as any).servicesManager;
    const layout = manager.getResource('LayoutService');
    layout.changeLayout('TwoThenThree');
    layout.setDockLayout('Single');
    layout.setSlots({
      Display: { slot: '1' },
      Minifeed: { slot: '2' },
      Scenes: { slot: '3' },
      Sources: { slot: '4' },
      Mixer: { slot: '5' },
      Multichat: { slot: 'S1' },
    });
    layout.setCustomized(true, false);
    manager.getResource('NavigationService').navigate('LayoutEditor', { stageStackedDock: true });
  });
  await focusMain();
  await waitForDisplayed('[data-name=dock-preview]');

  t.is(await zoneText('[data-name=dock-preview] [id="S1"]'), 'Mini Feed');
  t.is(await zoneText('[data-name=dock-preview] [id="S2"]'), 'Chat');
  t.is(await zoneText('[id="3"]'), 'Scene Selector', 'The rest of the layout is kept');
  t.not(await zoneText('[id="2"]'), '', 'The slot Mini Feed left is filled');

  await clickButton('Save Changes');
  t.is((await layoutSnapshot()).currentLayout, 'TwoThenThree');
});

test('The Dock Layouts tip stages the stacked dock in the layout editor', async t => {
  await focusWindow('worker');
  await getClient().execute(() => {
    const manager = (window as any).servicesManager;
    manager.getResource('LayoutService').setDockLayout('Single');
    manager.getResource('NavigationService').navigate('LayoutEditor', { stageStackedDock: true });
  });
  await focusMain();

  const dockZones = '[data-name=dock-preview] [id^="S"]';
  await waitForDisplayed('[data-name=dock-preview]');
  t.is((await getClient().$$(dockZones)).length, 2);
  t.is(await zoneText('[data-name=dock-preview] [id="S1"]'), 'Mini Feed');
  t.is(await zoneText('[data-name=dock-preview] [id="S2"]'), 'Chat');

  t.is((await layoutSnapshot()).dockLayout, 'Single', 'Nothing is saved until Save Changes');
});
