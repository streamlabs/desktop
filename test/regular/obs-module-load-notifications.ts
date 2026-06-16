import test from 'ava';
import {
  NDI_RUNTIME_NOT_FOUND,
  NDI_RUNTIME_VERSION_MISMATCH,
  activeSceneCollectionHasNdiSources,
  findNdiRuntimeLoadFailure,
  findNdiRuntimeVersionMismatch,
  getNdiRuntimeNotificationMessage,
  shouldShowNdiRuntimeNotification,
} from '../../app/services/obs-module-load-notifications';
import type { ISceneCollectionSchema } from '../../app/services/scene-collections';

function sceneCollection(
  id: string,
  sources: Array<{ sourceId: string; name: string; type: string; channel?: number }>,
): ISceneCollectionSchema {
  return {
    id,
    name: id,
    scenes: [],
    sources: sources.map(source => ({
      ...source,
      channel: source.channel ?? 0,
    })),
  };
}

test('findNdiRuntimeVersionMismatch returns obs-ndi version mismatch failure', t => {
  const failure = {
    module: 'obs-ndi',
    code: NDI_RUNTIME_VERSION_MISMATCH,
    message: 'Installed NDI Runtime version 5.6.0 is not supported.',
  };

  t.is(
    findNdiRuntimeVersionMismatch([
      { module: 'other-plugin', code: NDI_RUNTIME_VERSION_MISMATCH, message: 'ignore' },
      failure,
    ]),
    failure,
  );
});

test('findNdiRuntimeVersionMismatch handles obs-ndi module filenames', t => {
  const failure = {
    module: 'obs-ndi.dll',
    code: NDI_RUNTIME_VERSION_MISMATCH,
    message: 'Installed NDI Runtime version 5.6.0 is not supported.',
  };

  t.is(findNdiRuntimeVersionMismatch([failure]), failure);
});

test('findNdiRuntimeLoadFailure returns obs-ndi runtime not found failure', t => {
  const failure = {
    module: 'obs-ndi',
    code: NDI_RUNTIME_NOT_FOUND,
    message: 'NDI Runtime 6 or newer was not found.',
  };

  t.is(findNdiRuntimeLoadFailure([failure]), failure);
});

test('findNdiRuntimeVersionMismatch ignores unrelated module failures', t => {
  t.is(
    findNdiRuntimeVersionMismatch([
      { module: 'obs-ndi', code: 'NDI_RUNTIME_NOT_FOUND', message: 'ignore' },
      { module: 'other-plugin', code: NDI_RUNTIME_VERSION_MISMATCH, message: 'ignore' },
    ]),
    null,
  );
});

test('getNdiRuntimeNotificationMessage asks users to install missing runtime', t => {
  t.is(
    getNdiRuntimeNotificationMessage(NDI_RUNTIME_NOT_FOUND),
    'NDI Runtime was not found. Install NDI Tools to use NDI sources and outputs.',
  );
});

test('getNdiRuntimeNotificationMessage asks users to upgrade old runtime', t => {
  t.is(
    getNdiRuntimeNotificationMessage(NDI_RUNTIME_VERSION_MISMATCH),
    'NDI Runtime 6 or newer is required for NDI sources and outputs. Click to download the latest NDI Runtime.',
  );
});

test('activeSceneCollectionHasNdiSources returns true for active collection with ndi source', t => {
  t.true(
    activeSceneCollectionHasNdiSources(
      [
        sceneCollection('active', [
          { sourceId: 'camera', name: 'Camera', type: 'ndi_source' },
          { sourceId: 'browser', name: 'Browser', type: 'browser_source' },
        ]),
      ],
      'active',
    ),
  );
});

test('activeSceneCollectionHasNdiSources ignores ndi sources in inactive collections', t => {
  t.false(
    activeSceneCollectionHasNdiSources(
      [
        sceneCollection('active', [
          { sourceId: 'browser', name: 'Browser', type: 'browser_source' },
        ]),
        sceneCollection('inactive', [
          { sourceId: 'camera', name: 'Camera', type: 'ndi_source' },
        ]),
      ],
      'active',
    ),
  );
});

test('activeSceneCollectionHasNdiSources returns false without active collection id', t => {
  t.false(
    activeSceneCollectionHasNdiSources(
      [
        sceneCollection('active', [{ sourceId: 'camera', name: 'Camera', type: 'ndi_source' }]),
      ],
      undefined,
    ),
  );
});

test('shouldShowNdiRuntimeNotification returns true for ndi runtime failure in active ndi collection', t => {
  t.true(
    shouldShowNdiRuntimeNotification(
      [
        {
          module: 'obs-ndi',
          code: NDI_RUNTIME_NOT_FOUND,
          message: 'NDI Runtime 6 or newer was not found.',
        },
      ],
      [
        sceneCollection('active', [{ sourceId: 'camera', name: 'Camera', type: 'ndi_source' }]),
      ],
      'active',
    ),
  );
});

test('shouldShowNdiRuntimeNotification returns false for ndi runtime failure in active non-ndi collection', t => {
  t.false(
    shouldShowNdiRuntimeNotification(
      [
        {
          module: 'obs-ndi',
          code: NDI_RUNTIME_NOT_FOUND,
          message: 'NDI Runtime 6 or newer was not found.',
        },
      ],
      [
        sceneCollection('active', [
          { sourceId: 'browser', name: 'Browser', type: 'browser_source' },
        ]),
        sceneCollection('inactive', [
          { sourceId: 'camera', name: 'Camera', type: 'ndi_source' },
        ]),
      ],
      'active',
    ),
  );
});

test('shouldShowNdiRuntimeNotification returns false for active ndi collection without ndi runtime failure', t => {
  t.false(
    shouldShowNdiRuntimeNotification(
      [{ module: 'other-plugin', code: 'MODULE_LOAD_FAILED', message: 'ignore' }],
      [
        sceneCollection('active', [{ sourceId: 'camera', name: 'Camera', type: 'ndi_source' }]),
      ],
      'active',
    ),
  );
});
