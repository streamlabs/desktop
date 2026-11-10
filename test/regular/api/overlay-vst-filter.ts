import { getApiClient } from '../../helpers/api-client';
import { test, useWebdriver, TExecutionContext } from '../../helpers/webdriver';
import { focusMain, focusWindow } from '../../helpers/modules/core';
import type { OverlaysPersistenceService } from 'services/scene-collections/overlays';
import type { ScenesService } from 'services/scenes';
import type { SourceFiltersService } from 'services/source-filters';
import extractZip = require('extract-zip');
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

test('Exporting an overlay writes only the VST plugin file name', async t => {
  const localPath = 'C:\\Users\\streamer\\VstPlugins\\Foo.dll';
  const overlayPath = path.join(t.context.cacheDir, 'vst-export.overlay');
  const extractDir = path.join(t.context.cacheDir, 'vst-export');

  t.true(await focusWindow('worker'), 'worker window is available');
  try {
    await t.context.app.client.execute(
      (filePath, vstPath) => {
        const manager = (window as any).servicesManager;
        const scenes = manager.getResource('ScenesService') as ScenesService;
        const filters = manager.getResource('SourceFiltersService') as SourceFiltersService;
        const scene = scenes.createScene('VST Export Scene');
        const item = scene.createAndAddSource('VST Export Source', 'color_source');
        filters.add(item.sourceId, 'vst_filter', 'VST 2.x Plug-in', {
          plugin_path: vstPath,
          chunk_data_path_v3: vstPath,
          chunk_data_v2: `${vstPath}|AAAA`,
        });
        return (manager.getResource(
          'OverlaysPersistenceService',
        ) as OverlaysPersistenceService).saveOverlay(filePath);
      },
      overlayPath,
      localPath,
    );
  } finally {
    await focusMain();
  }

  await new Promise<void>((resolve, reject) => {
    extractZip(overlayPath, { dir: extractDir }, err => (err ? reject(err) : resolve()));
  });
  const configText = fs.readFileSync(path.join(extractDir, 'config.json'), 'utf8');
  const vstFilters: any[] = [];
  JSON.parse(configText, (key, value) => {
    if (value && value.type === 'vst_filter') vstFilters.push(value);
    return value;
  });

  t.true(vstFilters.length > 0, 'exported overlay contains the vst filter');
  for (const filter of vstFilters) {
    t.is(filter.settings.plugin_path, 'Foo.dll');
    t.is(filter.settings.chunk_data_path_v3, 'Foo.dll');
    t.false('chunk_data_v2' in filter.settings, 'legacy chunk data is not exported');
  }
  t.false(configText.includes('streamer'), 'no local path is written to the overlay');
});
