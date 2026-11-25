import { test, useWebdriver } from '../helpers/webdriver';
import { focusWindow } from '../helpers/modules/core';

// not a React hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('normal shutdown releases scenes before destroying their assigned video contexts', async t => {
  t.true(await focusWindow('worker'));
  const result = (await t.context.app.client.execute(`
    return (() => {
      const get = name => window.servicesManager.getResource(name);
      const video = get('VideoSettingsService');
      const scenes = get('ScenesService');
      const scene = scenes.createScene('Video context shutdown regression');
      scene.createAndAddSource('Horizontal source', 'color_source_v3', {}, { display: 'horizontal' });
      scene.createAndAddSource('Vertical source', 'color_source_v3', {}, { display: 'vertical' });
      const assignedDisplays = scene.getItems().map(item => item.display).sort();
      return {
        assignedDisplays,
        horizontal: !!video.contexts.horizontal,
        vertical: !!video.contexts.vertical,
      };
    })();
  `)) as { assignedDisplays: string[]; horizontal: boolean; vertical: boolean };
  t.deepEqual(result.assignedDisplays, ['horizontal', 'vertical']);
  t.true(result.horizontal);
  t.true(result.vertical);
  // The WebDriver teardown closes the real app, waits for Electron to exit,
  // and fails on logged shutdown exceptions. Leave both assignments alive so
  // destroying contexts before releasing the scenes reproduces the failure.
});
