import { useWebdriver, test, TExecutionContext } from '../helpers/webdriver';
import { addSource, sourceIsExisting } from '../helpers/modules/sources';
import { SceneBuilder } from '../helpers/scene-builder';
import {
  addScene,
  clickRemoveScene,
  selectScene,
  duplicateScene,
  sceneExisting,
} from '../helpers/modules/scenes';
import { focusMain, getClient, useMainWindow } from '../helpers/modules/core';
import { getApiClient } from '../helpers/api-client';
import { withUser } from '../helpers/webdriver/user';
import { toggleDualOutputMode } from '../helpers/modules/dual-output';

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

test.skip('Dual output undo/redo', withUser(), async t => {
  await toggleDualOutputMode(false);

  const sceneBuilder = new SceneBuilder(await getApiClient());

  // TODO: Test for sceneNodeMap = {}
  await addSource('Color Block', 'Color Source');
  t.true(
    sceneBuilder.isEqualTo(
      `
      Color Block
      Color Block
    `,
    ),
  );
  // TODO: Test for sceneNodeMap = { [horizontalId]: verticalId }

  await undo();

  // TODO: Test for sceneNodeMap = {}
  t.true(sceneBuilder.isEqualTo(''));

  await redo();

  t.true(
    sceneBuilder.isEqualTo(
      `
      Color Block
      Color Block
    `,
    ),
  );

  await addSource('Color Block', 'Color Source 2');
  await addSource('Color Block', 'Color Source 3');

  t.true(
    sceneBuilder.isEqualTo(
      `
    Color Source 3:
    Color Source 2:
    Color Source:
    Color Source 3:
    Color Source 2:
    Color Source:
  `,
    ),
  );

  await undo();

  console.log('scene is now ', sceneBuilder.getSceneSchema());
  console.log('scene is now ', sceneBuilder.getSceneScketch());
});
