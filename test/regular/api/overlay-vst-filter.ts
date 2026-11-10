import { getApiClient } from '../../helpers/api-client';
import { test, useWebdriver, TExecutionContext } from '../../helpers/webdriver';
import { focusMain, focusWindow } from '../../helpers/modules/core';
import type { OverlaysPersistenceService } from 'services/scene-collections/overlays';
import type { ScenesService } from 'services/scenes';
import type { SourceFiltersService } from 'services/source-filters';
import fs = require('fs');
import path = require('path');
import archiver = require('archiver');

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

interface IFilterSnapshot {
  name: string;
  type: string;
  settings: Dictionary<any>;
}

async function writeOverlay(overlayPath: string, filters: any[]) {
  const sceneId = 'vst-filter-overlay-scene';
  const config = {
    nodeType: 'RootNode',
    schemaVersion: 2,
    scenes: {
      nodeType: 'ScenesNode',
      schemaVersion: 2,
      items: [
        {
          name: 'VST Filter Overlay',
          sceneId,
          slots: {
            nodeType: 'SlotsNode',
            schemaVersion: 1,
            items: [
              {
                id: 'vst-item',
                name: 'Filtered image',
                sceneNodeType: 'item',
                x: 0,
                y: 0,
                scaleX: 0.1,
                scaleY: 0.1,
                visible: true,
                locked: false,
                content: { nodeType: 'ImageNode', schemaVersion: 1, filename: 'sun.png' },
                filters,
              },
            ],
          },
        },
      ],
    },
  };

  const archive = archiver('zip', { store: true });
  const output = fs.createWriteStream(overlayPath);
  await new Promise<void>((resolve, reject) => {
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);
    archive.append(JSON.stringify(config), { name: 'config.json' });
    archive.file(path.resolve('test/data/sources-files/images/sun.png'), { name: 'sun.png' });
    archive.finalize();
  });

  return sceneId;
}

async function importedFilters(t: TExecutionContext, overlayPath: string, sceneId: string) {
  t.true(await focusWindow('worker'), 'worker window is available');
  try {
    await t.context.app.client.execute(filePath => {
      const manager = (window as any).servicesManager;
      const overlays = manager.getResource(
        'OverlaysPersistenceService',
      ) as OverlaysPersistenceService;
      return overlays.loadOverlay(filePath);
    }, overlayPath);

    return (await t.context.app.client.execute(id => {
      const manager = (window as any).servicesManager;
      const scenes = manager.getResource('ScenesService') as ScenesService;
      const filters = manager.getResource('SourceFiltersService') as SourceFiltersService;
      const [item] = scenes.views.getScene(id).getItems();
      return filters.views.filtersBySourceId(item.sourceId, true).map(filter => ({
        name: filter.name,
        type: filter.type,
        settings: Object.assign({}, filter.settings),
      }));
    }, sceneId)) as IFilterSnapshot[];
  } finally {
    await focusMain();
  }
}

test('Importing an overlay keeps only the VST plugin file name', async t => {
  const overlayPath = path.join(t.context.cacheDir, 'vst-filter.overlay');
  const sceneId = await writeOverlay(overlayPath, [
    {
      name: 'VST 2.x Plug-in',
      type: 'vst_filter',
      settings: {
        plugin_path: '\\\\example.invalid\\s\\Foo.dll',
        chunk_data_path_v3: '\\\\example.invalid\\s\\Foo.dll',
        chunk_data_0_v3: 'AAAA',
      },
    },
    { name: 'Gain', type: 'gain_filter', settings: { db: 3 } },
  ]);

  const filters = await importedFilters(t, overlayPath, sceneId);

  const vst = filters.find(filter => filter.type === 'vst_filter');
  t.truthy(vst, 'vst filter is imported');
  t.is(vst.settings.plugin_path, 'Foo.dll');
  t.false(/[\\/]/.test(vst.settings.plugin_path as string), 'plugin_path has no separators');
  t.is(vst.settings.chunk_data_path_v3, 'Foo.dll');

  const gain = filters.find(filter => filter.type === 'gain_filter');
  t.is(gain.settings.db, 3, 'other filter types import unchanged');
});
