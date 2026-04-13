import { useWebdriver, test } from '../helpers/webdriver';
import { addExistingSource, addSource, sourceIsExisting } from '../helpers/modules/sources';
import { SceneBuilder } from '../helpers/scene-builder';
import {
  addScene,
  clickRemoveScene,
  selectScene,
  duplicateScene,
  sceneExisting,
} from '../helpers/modules/scenes';
import { focusMain, click, isDisplayed, useMainWindow, getClient } from '../helpers/modules/core';
import { getApiClient } from '../helpers/api-client';
import { logIn, logOut, releaseUserInPool } from '../helpers/webdriver/user';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver({
  clearCollectionAfterEachTest: true,
  restartAppAfterEachTest: false,
});

async function undo() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  await useMainWindow(async () => {
    await ((getClient().keys(['Control', 'z']) as any) as Promise<any>);
    await ((getClient().keys('Control') as any) as Promise<any>);
  });
}

async function redo() {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  await useMainWindow(async () => {
    await ((getClient().keys(['Control', 'y']) as any) as Promise<any>);
    await ((getClient().keys('Control') as any) as Promise<any>);
  });
}

test('Creating some sources with undo/redo', async t => {
  await focusMain();

  const sceneBuilder = new SceneBuilder(await getApiClient());

  await addSource('Color Block', 'Color Source');
  await addSource('Color Block', 'Color Source 2');
  await addSource('Color Block', 'Color Source 3');

  t.true(
    sceneBuilder.isEqualTo(
      `
    Color Source 3:
    Color Source 2:
    Color Source:
  `,
    ),
  );

  await undo();

  t.true(
    sceneBuilder.isEqualTo(
      `
    Color Source 2:
    Color Source:
  `,
    ),
  );

  await undo();
  t.true(
    sceneBuilder.isEqualTo(
      `
    Color Source:
  `,
    ),
  );

  await undo();
  t.true(sceneBuilder.isEqualTo(''));

  await redo();
  await redo();
  await redo();

  t.true(
    sceneBuilder.isEqualTo(
      `
    Color Source 3:
    Color Source 2:
    Color Source:
  `,
    ),
  );
});

test('Deleting a scene with undo/redo', async t => {
  const sceneBuilder = new SceneBuilder(await getApiClient());

  await addScene('New Scene');

  // Build a complex item and folder hierarchy
  const sketch = `
    Item1:
    Item2:
    Folder1
      Item3:
      Item4:
    Item5:
    Folder2
      Item6:
      Folder3
        Item7:
        Item8:
      Item9:
      Folder4
        Item10:
    Item11:
  `;

  sceneBuilder.build(sketch);

  await focusMain();
  await clickRemoveScene('New Scene');

  t.true(sceneBuilder.isEqualTo(''));

  await undo();
  await selectScene('New Scene');

  t.true(sceneBuilder.isEqualTo(sketch));

  await redo();
  t.true(sceneBuilder.isEqualTo(''));
});

test('Duplicating a scene with undo/redo', async t => {
  const sceneBuilder = new SceneBuilder(await getApiClient());

  // Build a complex item and folder hierarchy
  const sketch = `
    Item1:
    Item2:
    Folder1
      Item3:
      Item4:
    Item5:
    Folder2
      Item6:
      Folder3
        Item7:
        Item8:
      Item9:
      Folder4
        Item10:
    Item11:
  `;

  sceneBuilder.build(sketch);
  await duplicateScene('Scene', 'Duplicate');
  await focusMain();

  await selectScene('Duplicate');
  t.true(sceneBuilder.isEqualTo(sketch));

  await selectScene('Scene');
  t.true(sceneBuilder.isEqualTo(sketch));

  await undo();

  t.false(await sceneExisting('Duplicate'));

  await redo();

  await selectScene('Duplicate');
  t.true(sceneBuilder.isEqualTo(sketch));
});

test('Editor commands', async t => {
  const sceneBuilder = new SceneBuilder(await getApiClient());
  // Single Output Mode

  // New source
  await addSource('Color Block', 'Block 0');
  await focusMain();
  t.true(await sourceIsExisting('Block 0'));
  t.true(sceneBuilder.isEqualTo('Block 0: color_source, [horizontal]'));

  await undo();
  t.false(await sourceIsExisting('Block 0'));
  t.true(sceneBuilder.isEqualTo(''));

  await redo();
  t.true(await sourceIsExisting('Block 0'));
  t.true(
    sceneBuilder.isEqualTo('Block 0: color_source, [horizontal]'),
    'Single output: undo/redo creates new source',
  );

  // Existing source
  await addExistingSource('Color Block', 'Block 0');
  await focusMain();
  t.true(
    sceneBuilder.isEqualTo(`
    Block 0: color_source, [horizontal]
    Block 0: color_source, [horizontal]
  `),
  );
  await undo();

  t.true(
    sceneBuilder.isEqualTo(`
    Block 0: color_source, [horizontal]
  `),
  );

  await redo();
  t.true(
    sceneBuilder.isEqualTo(
      `
    Block 0: color_source, [horizontal]
    Block 0: color_source, [horizontal]
  `,
    ),
    'Single Output: undo/redo adds existing source',
  );

  // Source is placed in the correct order
  await addSource('Color Block', 'Block 1');
  await focusMain();
  t.true(await sourceIsExisting('Block 1'));
  t.true(
    sceneBuilder.isEqualTo(`
    Block 1: color_source, [horizontal]
    Block 0: color_source, [horizontal]
    Block 0: color_source, [horizontal]
  `),
  );

  await undo();
  t.false(await sourceIsExisting('Block 1'));
  t.true(
    sceneBuilder.isEqualTo(`
    Block 0: color_source, [horizontal]
    Block 0: color_source, [horizontal]
  `),
  );

  await redo();
  t.true(await sourceIsExisting('Block 1'));
  t.true(
    sceneBuilder.isEqualTo(`
    Block 1: color_source, [horizontal]
    Block 0: color_source, [horizontal]
    Block 0: color_source, [horizontal]
  `),
    'Single Output: undo/redo places source in correct order',
  );

  // Dual Output Mode

  // New source
  const user = await logIn(t);
  await focusMain();
  await click('[data-name=dual-output-toggle]');
  await isDisplayed('div#vertical-display');

  await addSource('Color Block', 'Block 2');
  await focusMain();
  t.true(await sourceIsExisting('Block 2', true));
  t.true(
    sceneBuilder.isEqualTo(`
    Block 2: color_source, [horizontal]
    Block 2: color_source, [vertical]
  `),
  );

  await undo();
  t.false(await sourceIsExisting('Block 2', true));
  t.true(sceneBuilder.isEqualTo(''));

  await redo();
  t.true(await sourceIsExisting('Block 2', true));
  t.true(
    sceneBuilder.isEqualTo(`
    Block 2: color_source, [horizontal]
    Block 2: color_source, [vertical]
  `),
    'Dual Output: undo/redo creates new source',
  );

  // Existing source
  await addExistingSource('Color Block', 'Block 2');
  await focusMain();
  t.true(
    sceneBuilder.isEqualTo(`
    Block 2: color_source, [horizontal]
    Block 2: color_source, [horizontal]
    Block 2: color_source, [vertical]
    Block 2: color_source, [vertical]
  `),
  );
  await undo();
  t.true(
    sceneBuilder.isEqualTo(`
    Block 2: color_source, [horizontal]
    Block 2: color_source, [vertical]
  `),
  );

  await redo();
  t.true(
    sceneBuilder.isEqualTo(
      `
    Block 2: color_source, [horizontal]
    Block 2: color_source, [horizontal]
    Block 2: color_source, [vertical]
    Block 2: color_source, [vertical]
  `,
    ),
    'Dual Output: undo/redo adds existing source',
  );

  // New source is placed in the correct order
  await addSource('Color Block', 'Block 3');
  await focusMain();
  t.true(await sourceIsExisting('Block 3', true));
  t.true(
    sceneBuilder.isEqualTo(`
    Block 3: color_source, [horizontal]
    Block 2: color_source, [horizontal]
    Block 2: color_source, [horizontal]
    Block 3: color_source, [vertical]
    Block 2: color_source, [vertical]
    Block 2: color_source, [vertical]
  `),
  );

  await undo();
  t.false(await sourceIsExisting('Block 3', true));
  t.true(
    sceneBuilder.isEqualTo(`
    Block 2: color_source, [horizontal]
    Block 2: color_source, [horizontal]
    Block 2: color_source, [vertical]
    Block 2: color_source, [vertical]
  `),
  );

  await redo();
  t.true(await sourceIsExisting('Block 3', true));
  t.true(
    sceneBuilder.isEqualTo(
      `
    Block 3: color_source, [horizontal]
    Block 2: color_source, [horizontal]
    Block 2: color_source, [horizontal]
    Block 3: color_source, [vertical]
    Block 2: color_source, [vertical]
    Block 2: color_source, [vertical]
  `,
    ),
    'Dual Output: undo/redo places source in correct order',
  );

  await logOut(t);
  await releaseUserInPool(user);

  t.pass();
});
