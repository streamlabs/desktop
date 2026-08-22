import test from 'ava';
import {
  applyBaseResolutionSteps,
  baseResolutionResetRequired,
  baseResolutionsMatch,
  hasBaseResolutionSettings,
  resolveBaseResolutionDisplay,
  resolveCollectionBaseResolutions,
  resolveSerializedCollectionBaseResolutions,
} from '../../app/services/settings-v2/base-resolutions';
import {
  CoordinateMigrationPersistenceError,
  persistCoordinateMigration,
  shouldAttemptCollectionRecovery,
} from '../../app/services/scene-collections/coordinate-migration';
import {
  AutoSavePauseCoordinator,
  SceneCollectionOperationCoordinator,
} from '../../app/services/scene-collections/operation-coordinator';
import {
  normalizeEditedCrop,
  normalizeLoadedCrop,
} from '../../app/services/scenes/scene-item-crop';

const current = {
  horizontal: { baseWidth: 1920, baseHeight: 1080 },
  vertical: { baseWidth: 1080, baseHeight: 1920 },
};

test('base-resolution settings are detected from the final patch', t => {
  t.true(
    hasBaseResolutionSettings({
      outputWidth: 720,
      outputHeight: 1280,
      baseWidth: 720,
      baseHeight: 1280,
    }),
  );
  t.true(hasBaseResolutionSettings({ baseWidth: undefined }));
  t.false(hasBaseResolutionSettings({ outputWidth: 1280, outputHeight: 720 }));
});

test('legacy overlay sources without a display use the horizontal canvas', t => {
  const legacyDisplays: Partial<Record<'game_capture' | 'scene', 'horizontal' | 'vertical'>> = {};

  t.is(resolveBaseResolutionDisplay(legacyDisplays.game_capture), 'horizontal');
  t.is(resolveBaseResolutionDisplay(legacyDisplays.scene), 'horizontal');
  t.is(resolveBaseResolutionDisplay('vertical'), 'vertical');
});

test('pre-v4 migration preserves the saved horizontal base and adopts current vertical base', t => {
  const result = resolveCollectionBaseResolutions(
    3,
    { baseWidth: 1600, baseHeight: 900 },
    undefined,
    current,
  );

  t.deepEqual(result, {
    horizontal: { baseWidth: 1600, baseHeight: 900 },
    vertical: current.vertical,
  });
});

test('v4 migration handles missing display baselines independently', t => {
  const result = resolveCollectionBaseResolutions(
    4,
    { baseWidth: 800, baseHeight: 600 },
    {
      horizontal: { baseWidth: 1280, baseHeight: 720 },
    },
    current,
  );

  t.deepEqual(result, {
    horizontal: { baseWidth: 1280, baseHeight: 720 },
    vertical: current.vertical,
  });
});

test('collection preflight resolves legacy v3 authored resolution metadata', t => {
  t.deepEqual(
    resolveSerializedCollectionBaseResolutions(
      {
        schemaVersion: 3,
        baseResolution: { baseWidth: 1600, baseHeight: 900 },
      },
      current,
    ),
    {
      horizontal: { baseWidth: 1600, baseHeight: 900 },
      vertical: current.vertical,
    },
  );
});

test('collection preflight resolves independent v4 and v5 authored baselines', t => {
  const saved = {
    horizontal: { baseWidth: 1280, baseHeight: 720 },
    vertical: { baseWidth: 720, baseHeight: 1280 },
  };

  for (const schemaVersion of [4, 5]) {
    t.deepEqual(
      resolveSerializedCollectionBaseResolutions(
        { schemaVersion, baseResolutions: saved },
        current,
      ),
      saved,
    );
  }
});

test('matching baselines do not require an established video context reset', t => {
  t.false(baseResolutionResetRequired(current, current));
});

test('a mismatch on either established display requires a video context reset', t => {
  t.true(
    baseResolutionResetRequired(current, {
      ...current,
      horizontal: { baseWidth: 1280, baseHeight: 720 },
    }),
  );
  t.true(
    baseResolutionResetRequired(current, {
      ...current,
      vertical: { baseWidth: 720, baseHeight: 1280 },
    }),
  );
});

test('a missing vertical context does not turn a persisted vertical change into a native reset', t => {
  t.false(
    baseResolutionResetRequired(
      { horizontal: current.horizontal },
      {
        horizontal: current.horizontal,
        vertical: { baseWidth: 720, baseHeight: 1280 },
      },
    ),
  );
});

test('baseline transaction applies a missing vertical context through its persistence step', t => {
  let horizontal = { baseWidth: 1920, baseHeight: 1080 };
  let persistedVertical = { baseWidth: 1080, baseHeight: 1920 };

  applyBaseResolutionSteps([
    {
      display: 'horizontal',
      snapshot: horizontal,
      target: { baseWidth: 1280, baseHeight: 720 },
      apply: value => (horizontal = value),
    },
    {
      display: 'vertical',
      snapshot: persistedVertical,
      target: { baseWidth: 720, baseHeight: 1280 },
      apply: value => (persistedVertical = value),
    },
  ]);

  t.deepEqual(horizontal, { baseWidth: 1280, baseHeight: 720 });
  t.deepEqual(persistedVertical, { baseWidth: 720, baseHeight: 1280 });
});

test('unchanged collection baselines do not reset video contexts', t => {
  let resetCalls = 0;

  t.notThrows(() =>
    applyBaseResolutionSteps([
      {
        display: 'horizontal',
        snapshot: { baseWidth: 1920, baseHeight: 1080 },
        target: { baseWidth: 1920, baseHeight: 1080 },
        apply: () => {
          resetCalls++;
          throw new Error('video active');
        },
      },
      {
        display: 'vertical',
        snapshot: { baseWidth: 1080, baseHeight: 1920 },
        target: { baseWidth: 1080, baseHeight: 1920 },
        apply: () => {
          resetCalls++;
          throw new Error('video active');
        },
      },
    ]),
  );

  t.is(resetCalls, 0);
});

test('baseline equality requires two valid positive resolutions', t => {
  t.true(
    baseResolutionsMatch(
      { baseWidth: 1920, baseHeight: 1080 },
      { baseWidth: 1920, baseHeight: 1080 },
    ),
  );
  t.false(baseResolutionsMatch(undefined, undefined));
  t.false(baseResolutionsMatch({}, {}));
  t.false(
    baseResolutionsMatch({ baseWidth: 1920, baseHeight: 0 }, { baseWidth: 1920, baseHeight: 0 }),
  );
});

test('baseline transaction applies only displays whose dimensions changed', t => {
  const applied: string[] = [];

  applyBaseResolutionSteps([
    {
      display: 'horizontal',
      snapshot: { baseWidth: 1920, baseHeight: 1080 },
      target: { baseWidth: 1920, baseHeight: 1080 },
      apply: () => applied.push('horizontal'),
    },
    {
      display: 'vertical',
      snapshot: { baseWidth: 1080, baseHeight: 1920 },
      target: { baseWidth: 720, baseHeight: 1280 },
      apply: () => applied.push('vertical'),
    },
  ]);

  t.deepEqual(applied, ['vertical']);
});

test('baseline transaction restores the first display when the second display fails', t => {
  const originalHorizontal = { baseWidth: 1920, baseHeight: 1080 };
  let horizontal = originalHorizontal;
  const secondDisplayError = new Error('vertical reset failed');

  const error = t.throws(() =>
    applyBaseResolutionSteps([
      {
        display: 'horizontal',
        snapshot: originalHorizontal,
        target: { baseWidth: 1280, baseHeight: 720 },
        apply: value => (horizontal = value),
      },
      {
        display: 'vertical',
        snapshot: { baseWidth: 1080, baseHeight: 1920 },
        target: { baseWidth: 720, baseHeight: 1280 },
        apply: () => {
          throw secondDisplayError;
        },
      },
    ]),
  );

  t.is(error, secondDisplayError);
  t.deepEqual(horizontal, originalHorizontal);
});

test('coordinate migration backup failure restores the original and remains failed', async t => {
  const events: string[] = [];
  const backupError = new Error('backup flush failed');
  let flushCount = 0;

  const error = await t.throwsAsync(() =>
    persistCoordinateMigration({
      backupMatches: async () => false,
      writeBackup: () => events.push('backup'),
      writeMigrated: async () => {
        events.push('migrated');
      },
      restoreOriginal: () => events.push('restore'),
      flush: async () => {
        events.push('flush');
        if (flushCount++ === 0) throw backupError;
      },
    }),
  );

  t.is(error, backupError);
  t.deepEqual(events, ['backup', 'flush', 'restore', 'flush']);
});

test('coordinate migration replaces and verifies a stale partial backup', async t => {
  let backup = 'partial';
  const original = '{"version":4}';
  const events: string[] = [];

  await persistCoordinateMigration({
    backupMatches: async () => backup === original,
    writeBackup: () => {
      events.push('backup');
      backup = original;
    },
    writeMigrated: async () => {
      events.push('migrated');
    },
    restoreOriginal: () => events.push('restore'),
    flush: async () => {
      events.push('flush');
    },
  });

  t.deepEqual(events, ['backup', 'flush', 'migrated', 'flush']);
  t.is(backup, original);
});

test('scene collection operations remain serialized after a failure', async t => {
  const coordinator = new SceneCollectionOperationCoordinator();
  const events: string[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>(resolve => (releaseFirst = resolve));

  const first = coordinator.run(async () => {
    events.push('first:start');
    await firstGate;
    events.push('first:fail');
    throw new Error('first failed');
  });
  const second = coordinator.run(async () => {
    events.push('second:start');
    events.push('second:finish');
  });

  await Promise.resolve();
  t.deepEqual(events, ['first:start']);
  releaseFirst();
  await t.throwsAsync(first);
  await second;
  t.deepEqual(events, ['first:start', 'first:fail', 'second:start', 'second:finish']);
});

test('migration persistence failures bypass ordinary collection recovery', t => {
  t.false(
    shouldAttemptCollectionRecovery(
      new CoordinateMigrationPersistenceError(new Error('disk is full')),
    ),
  );
  t.true(shouldAttemptCollectionRecovery(new Error('collection JSON is corrupt')));
});

test('nested autosave pauses resume only after every owner releases', t => {
  const pauses = new AutoSavePauseCoordinator();
  const loadingMode = pauses.acquire(true);
  const resize = pauses.acquire(false);

  t.deepEqual(pauses.release(loadingMode), {
    becameUnpaused: false,
    resumeAllowed: true,
    shouldResume: false,
  });
  t.true(pauses.isPaused);
  t.deepEqual(pauses.release(resize), {
    becameUnpaused: true,
    resumeAllowed: true,
    shouldResume: true,
  });
  t.false(pauses.isPaused);
});

test('a failed nested autosave owner vetoes a later resume', t => {
  const pauses = new AutoSavePauseCoordinator();
  const loadingMode = pauses.acquire(true);
  const resize = pauses.acquire(false);

  t.false(pauses.release(resize, false).resumeAllowed);
  t.deepEqual(pauses.release(loadingMode), {
    becameUnpaused: true,
    resumeAllowed: false,
    shouldResume: false,
  });
});

test('legacy nested-scene crops adopt their matching display baseline', t => {
  const crop = { top: 12, right: 24, bottom: 36, left: 48 };

  t.deepEqual(normalizeLoadedCrop(crop, true, current.vertical), {
    ...crop,
    referenceWidth: 1080,
    referenceHeight: 1920,
  });
  t.deepEqual(normalizeLoadedCrop(crop, false, current.vertical), crop);
});

test('saved nested-scene crop anchors survive load and user edits intentionally reanchor', t => {
  const crop = {
    top: 12.4,
    right: 24.6,
    bottom: 36.1,
    left: 48.9,
    referenceWidth: 720,
    referenceHeight: 1280,
  };

  t.deepEqual(normalizeLoadedCrop(crop, true, current.horizontal), crop);
  t.deepEqual(normalizeEditedCrop(crop, true, current.horizontal), {
    top: 12,
    right: 25,
    bottom: 36,
    left: 49,
    referenceWidth: 1920,
    referenceHeight: 1080,
  });
  t.deepEqual(normalizeEditedCrop(crop, false, current.horizontal), {
    top: 12,
    right: 25,
    bottom: 36,
    left: 49,
  });
});
