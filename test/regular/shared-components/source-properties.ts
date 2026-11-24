import { test, useWebdriver } from '../../helpers/webdriver';
import {
  closeWindow,
  focusChild,
  focusMain,
  focusWindow,
  getClient,
  select,
} from '../../helpers/modules/core';
import { clickRemoveSource } from '../../helpers/modules/sources';
import { ScenesService } from '../../../app/services/scenes';
import { EPathType, EPropertyType } from 'obs-studio-node';
import * as path from 'path';

// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

async function createSource() {
  await focusWindow('worker');
  return getClient().execute(() => {
    const scenes = (window as any).servicesManager.getResource('ScenesService') as ScenesService;
    return scenes.views.activeScene.createAndAddSource(
      'Source properties regression',
      'color_source',
      {
        width: 80,
        height: 80,
      },
    ).sourceId;
  });
}

async function observeChild(sourceId: string, delayMount = false) {
  await focusChild();
  await getClient().execute(
    (id: string, delay: boolean) => {
      const manager = (window as any).servicesManager;
      const originalSetTimeout = window.setTimeout;
      const fixture = {
        errors: [] as string[],
        deferredMounts: 0,
        sawShow: false,
        closed: false,
        updated: false,
        restore: () => {},
      };
      const onError = (event: ErrorEvent) => fixture.errors.push(event.message);
      window.addEventListener('error', onError);
      if (delay) {
        // Hold the normal deferred mount until after the close event has been delivered.
        window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: any[]) => {
          if (timeout === 50) fixture.deferredMounts += 1;
          return originalSetTimeout(handler, timeout === 50 ? 250 : timeout, ...args);
        }) as typeof window.setTimeout;
      }
      const windowSubscription = manager
        .getResource('WindowsService')
        .windowUpdated.subscribe(({ options }: any) => {
          if (options.componentName === 'SourceProperties' && options.isShown) {
            fixture.sawShow = true;
          }
          if (fixture.sawShow && !options.isShown) {
            // Let any uncancelled mount and React effects run before checking the closed window.
            originalSetTimeout(() => {
              fixture.closed = true;
            }, 400);
          }
        });
      const sourceSubscription = manager
        .getResource('SourcesService')
        .sourceUpdated.subscribe((source: any) => {
          if (source.sourceId !== id) return;
          // RxJS reports subscriber errors asynchronously, after delivering the source event.
          originalSetTimeout(() => {
            fixture.updated = true;
          }, 100);
        });
      fixture.restore = () => {
        window.setTimeout = originalSetTimeout;
        window.removeEventListener('error', onError);
        windowSubscription.unsubscribe();
        sourceSubscription.unsubscribe();
      };
      (window as any).__sourcePropertiesFixture = fixture;
    },
    sourceId,
    delayMount,
  );
}

async function updateSource(sourceId: string) {
  await focusChild();
  await getClient().execute(() => {
    (window as any).__sourcePropertiesFixture.updated = false;
  });
  await focusWindow('worker');
  await getClient().execute((id: string) => {
    (window as any).servicesManager.getResource('SourcesService').setMuted(id, true);
  }, sourceId);
  await focusChild();
  await getClient().waitUntil(
    () => getClient().execute(() => (window as any).__sourcePropertiesFixture.updated),
    { timeout: 10000, timeoutMsg: 'The child did not receive the source update' },
  );
}

async function cleanup() {
  await closeWindow('child');
  await focusChild();
  await getClient().execute(() => {
    (window as any).__sourcePropertiesFixture?.restore();
    delete (window as any).__sourcePropertiesFixture;
  });
  await focusMain();
  await clickRemoveSource('Source properties regression');
}

test('Plugin Save As uses the suggested path and filters and preserves the selection on cancel', async t => {
  const sourceId = await createSource();
  const suggested = path.join(t.context.cacheDir, 'suggested.json');
  const selected = path.join(t.context.cacheDir, 'chosen.json');
  const client = getClient();
  try {
    await client.execute(
      (id: string, defaultPath: string) => {
        const sources = (window as any).servicesManager.getResource('SourcesService');
        const manager = sources.propertiesManagers[id].manager;
        const source = manager.obsSource;
        const property = {
          type: EPropertyType.Path,
          name: 'export_path',
          description: 'Export path',
          enabled: true,
          visible: true,
          details: {
            type: EPathType.FileSave,
            defaultPath,
            filter: 'Presets (*.json *.txt);;All (*)',
          },
          get value() {
            return source.settings.export_path || '';
          },
          next: (): null => null,
        };
        manager.obsSource = {
          properties: { count: () => 1, first: () => property },
          settings: source.settings,
          update: (settings: Dictionary<string>) => source.update(settings),
        };
        sources.showSourceProperties(id);
      },
      sourceId,
      suggested,
    );
    await focusChild();
    const input = await select('input[data-name="export_path"]');
    await input.waitForDisplayed();
    const browse = await (await input.parentElement()).$('button');
    await browse.waitForClickable();
    await client.execute((filePath: string) => {
      const { dialog } = require('@electron/remote');
      const original = dialog.showSaveDialog;
      const calls: Electron.SaveDialogOptions[] = [];
      (window as any).__sourcePropertiesFixture = {
        calls,
        restore: () => {
          dialog.showSaveDialog = original;
        },
      };
      dialog.showSaveDialog = (options: Electron.SaveDialogOptions) => {
        calls.push(options);
        return Promise.resolve(
          calls.length === 1 ? { canceled: false, filePath } : { canceled: true },
        );
      };
    }, selected);
    await browse.click();
    await client.waitUntil(async () => (await input.getValue()) === selected);
    await browse.click();
    const calls = await client.execute(() => (window as any).__sourcePropertiesFixture.calls);
    const filters = [
      { name: 'Presets', extensions: ['json', 'txt'] },
      { name: 'All', extensions: ['*'] },
    ];
    t.deepEqual(calls, [
      { defaultPath: suggested, filters, properties: [] },
      { defaultPath: selected, filters, properties: [] },
    ]);
    t.is(await input.getValue(), selected);
    await focusWindow('worker');
    t.is(
      await client.execute((id: string) => {
        const sources = (window as any).servicesManager.getResource('SourcesService');
        return sources.views.getSource(id).getObsInput().settings.export_path;
      }, sourceId),
      selected,
    );
  } finally {
    await cleanup();
  }
});

test('Closing source properties cancels a deferred mount before source updates arrive', async t => {
  const sourceId = await createSource();
  await observeChild(sourceId, true);
  try {
    await focusWindow('worker');
    await getClient().execute((id: string) => {
      const manager = (window as any).servicesManager;
      manager.getResource('SourcesService').showSourceProperties(id);
      manager.getResource('WindowsService').closeChildWindow();
    }, sourceId);
    await focusChild();
    await getClient().waitUntil(
      () => getClient().execute(() => (window as any).__sourcePropertiesFixture.closed),
      { timeout: 10000, timeoutMsg: 'The properties window did not close' },
    );
    await updateSource(sourceId);
    const result = await getClient().execute(() => {
      const fixture = (window as any).__sourcePropertiesFixture;
      return {
        errors: fixture.errors,
        deferredMounts: fixture.deferredMounts,
        forms: document.querySelectorAll('[data-role="form"]').length,
      };
    });
    t.true(result.deferredMounts > 0, 'the properties mount was deferred');
    t.deepEqual(result.errors, []);
    t.is(result.forms, 0, 'closed properties must not mount later');
  } finally {
    await cleanup();
  }
});

test('Source properties tolerate a missing source when another source updates', async t => {
  const sourceId = await createSource();
  await observeChild(sourceId);
  try {
    await focusWindow('worker');
    await getClient().execute(() => {
      (window as any).servicesManager.getResource('WindowsService').showWindow({
        componentName: 'SourceProperties',
        queryParams: { sourceId: 'missing-source' },
        size: { width: 600, height: 800 },
      });
    });
    await focusChild();
    await (await select('[data-role="form"]')).waitForExist({ timeout: 10000 });
    await updateSource(sourceId);
    t.deepEqual(
      await getClient().execute(() => (window as any).__sourcePropertiesFixture.errors),
      [],
    );
  } finally {
    await cleanup();
  }
});
