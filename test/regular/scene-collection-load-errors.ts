import test from 'ava';
import { ArrayNode } from '../../app/services/scene-collections/nodes/array-node';
import {
  loadNodesForCoordinateMigration,
  loadNodesStrictly,
  reportNodeLoadError,
  StrictNodeLoadError,
} from '../../app/services/scene-collections/nodes/load-errors';
import {
  reportUncreatedSceneCollectionSources,
  SceneCollectionSourceCreationError,
} from '../../app/services/scene-collections/nodes/source-creation-errors';
import {
  assertCoordinateMigrationCompleted,
  CoordinateMigrationBlockedError,
} from '../../app/services/scene-collections/coordinate-migration';

class FailingArrayNode extends ArrayNode<string, {}, string> {
  schemaVersion = 1;
  data = { items: ['load item', 'after-load callback'] };

  constructor(readonly loadItemError: Error, readonly callbackError: Error) {
    super();
  }

  getItems(): string[] {
    return [];
  }

  async saveItem(item: string): Promise<string> {
    return item;
  }

  async loadItem(item: string): Promise<(() => Promise<void>) | void> {
    if (item === 'load item') throw this.loadItemError;
    return async () => {
      throw this.callbackError;
    };
  }
}

async function suppressExpectedConsoleErrors<T>(run: () => Promise<T>): Promise<T> {
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    return await run();
  } finally {
    console.error = originalConsoleError;
  }
}

test('uncreated sources fail a strict scene collection load', async t => {
  const requestedSources = [
    { name: 'created-source-id', type: 'color_source' },
    { name: 'missing-source-id', type: 'plugin_source' },
  ];

  const error = await t.throwsAsync(() =>
    loadNodesStrictly(async () => {
      // Equal array lengths protect the name-based reconciliation from regressing to the old
      // length-only comparison.
      const missingSources = reportUncreatedSceneCollectionSources(requestedSources, [
        { name: 'created-source-id' },
        { name: 'unexpected-source-id' },
      ]);
      t.deepEqual(missingSources, [requestedSources[1]]);
    }),
  );

  t.true(error instanceof StrictNodeLoadError);
  if (error instanceof StrictNodeLoadError) {
    t.is(error.errors.length, 1);
    t.true(error.errors[0] instanceof SceneCollectionSourceCreationError);
    if (error.errors[0] instanceof SceneCollectionSourceCreationError) {
      t.deepEqual(error.errors[0].sources, [requestedSources[1]]);
    }
  }
});

test('strict source creation failures block coordinate migration without rejecting', async t => {
  const migrationCanBePersisted = await loadNodesForCoordinateMigration(async () => {
    reportUncreatedSceneCollectionSources(
      [{ name: 'missing-source-id', type: 'plugin_source' }],
      [],
    );
  });

  t.false(migrationCanBePersisted);
});

test('other strict node failures still reject for collection file recovery', async t => {
  const error = await t.throwsAsync(() =>
    loadNodesForCoordinateMigration(async () => {
      reportNodeLoadError(new Error('serialized node could not be loaded'));
    }),
  );

  t.true(error instanceof StrictNodeLoadError);
});

test('mixed strict failures continue through collection file recovery', async t => {
  const error = await t.throwsAsync(() =>
    loadNodesForCoordinateMigration(async () => {
      reportUncreatedSceneCollectionSources(
        [{ name: 'missing-source-id', type: 'plugin_source' }],
        [],
      );
      reportNodeLoadError(new Error('serialized node could not be loaded'));
    }),
  );

  t.true(error instanceof StrictNodeLoadError);
});

test('created sources do not fail a strict scene collection load', async t => {
  const migrationCanBePersisted = await loadNodesForCoordinateMigration(async () => {
    const missingSources = reportUncreatedSceneCollectionSources(
      [
        { name: 'first-source-id', type: 'color_source' },
        { name: 'second-source-id', type: 'image_source' },
      ],
      [{ name: 'second-source-id' }, { name: 'first-source-id' }],
    );
    t.deepEqual(missingSources, []);
  });

  t.true(migrationCanBePersisted);
});

test('uncreated sources remain recoverable outside a strict migration', async t => {
  const missingSources = reportUncreatedSceneCollectionSources(
    [{ name: 'missing-source-id', type: 'plugin_source' }],
    [],
  );

  t.deepEqual(missingSources, [{ name: 'missing-source-id', type: 'plugin_source' }]);
  await t.notThrowsAsync(() => loadNodesStrictly(async () => {}));
});

test('strict node loads aggregate errors reported by non-array nodes', async t => {
  const sourceCreationError = new Error('source was not created');

  const error = await t.throwsAsync(() =>
    loadNodesStrictly(async () => {
      reportNodeLoadError(sourceCreationError);
    }),
  );

  t.true(error instanceof StrictNodeLoadError);
  if (error instanceof StrictNodeLoadError) {
    t.deepEqual(error.errors, [sourceCreationError]);
  }
});

test('array item and callback failures are reported to a strict load', async t => {
  const loadItemError = new Error('load item failed');
  const callbackError = new Error('after-load callback failed');

  await suppressExpectedConsoleErrors(async () => {
    await t.notThrowsAsync(() => new FailingArrayNode(loadItemError, callbackError).load({}));

    const error = await t.throwsAsync(() =>
      loadNodesStrictly(() => new FailingArrayNode(loadItemError, callbackError).load({})),
    );
    t.true(error instanceof StrictNodeLoadError);
    if (error instanceof StrictNodeLoadError) {
      t.deepEqual(error.errors, [loadItemError, callbackError]);
    }
  });
});

test('node load errors reported outside a strict load do not leak', async t => {
  reportNodeLoadError(new Error('ignored normal-load error'));

  await t.notThrowsAsync(() => loadNodesStrictly(async () => {}));
});

test('strict node loads reject overlap without corrupting the active collector', async t => {
  let releaseFirstLoad: () => void;
  const firstLoadBlocked = new Promise<void>(resolve => (releaseFirstLoad = resolve));
  const firstError = new Error('first load error');
  const firstLoad = loadNodesStrictly(async () => {
    reportNodeLoadError(firstError);
    await firstLoadBlocked;
  });

  await t.throwsAsync(() => loadNodesStrictly(async () => {}), {
    message: 'Strict scene collection loads must be serialized',
  });
  releaseFirstLoad!();

  const error = await t.throwsAsync(() => firstLoad);
  t.true(error instanceof StrictNodeLoadError);
  if (error instanceof StrictNodeLoadError) {
    t.deepEqual(error.errors, [firstError]);
  }
});

test('a directly thrown load error restores the strict collector', async t => {
  const directError = new Error('load failed directly');
  const error = await t.throwsAsync(() =>
    loadNodesStrictly(async () => {
      throw directError;
    }),
  );

  t.is(error, directError);
  await t.notThrowsAsync(() => loadNodesStrictly(async () => {}));
});

test('dependent operations reject a blocked coordinate migration', t => {
  const error = t.throws(() =>
    assertCoordinateMigrationCompleted(true, 'convert the scene collection'),
  );

  t.true(error instanceof CoordinateMigrationBlockedError);
  t.regex(error.message, /convert the scene collection/);
  t.notThrows(() => assertCoordinateMigrationCompleted(false, 'convert the scene collection'));
});
