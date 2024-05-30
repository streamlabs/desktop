import { useWebdriver, test, afterAppStart } from '../helpers/webdriver';
import { getApiClient } from '../helpers/api-client';
import { SceneBuilder } from '../helpers/scene-builder';
import { SceneItem, SceneItemNode, ScenesService } from 'services/scenes';
import { SelectionService } from 'services/selection';
import { IClipboardServiceApi } from 'services/clipboard';
import { ISceneCollectionsServiceApi } from 'services/scene-collections';
import { ISourcesServiceApi } from 'services/sources';
import { SourceFiltersService } from 'services/source-filters';

useWebdriver({ restartAppAfterEachTest: false });

let sceneBuilder: SceneBuilder;
let getNode: (name: string) => SceneItemNode;
let getNodeId: (name: string) => string;
let selectionService: SelectionService;
let clipboardService: IClipboardServiceApi;
let sourceFiltersService: SourceFiltersService;
let sceneCollectionsService: ISceneCollectionsServiceApi;
let sourcesService: ISourcesServiceApi;
let scenesService: ScenesService;

afterAppStart(async t => {
  const client = await getApiClient();
  scenesService = client.getResource('ScenesService');
  sourcesService = client.getResource('SourcesService');
  selectionService = client.getResource('SelectionService');
  clipboardService = client.getResource('ClipboardService');
  sceneCollectionsService = client.getResource('SceneCollectionsService');
  sourceFiltersService = client.getResource('SourceFiltersService');
  sceneBuilder = new SceneBuilder(client);
  getNode = name => sceneBuilder.scene.getNodeByName(name);
  getNodeId = name => sceneBuilder.scene.getNodeByName(name).id;
});

test('Simple copy/paste', async t => {
  sceneBuilder.build(`
    Folder1
    Item1: color_source
    Item2: image
  `);

  selectionService.select([getNodeId('Folder1'), getNodeId('Item2')]);
  clipboardService.copy();
  clipboardService.paste();

  t.true(
    sceneBuilder.isEqualTo(`
    Folder1
    Item2: image
    Folder1
    Item1: color_source
    Item2: image
  `),
  );
});

test('Copy/paste folder with items', async t => {
  sceneBuilder.build(`
    Folder1
    Folder2
      Item1:
      Folder3
        Item2:
  `);

  selectionService.select(getNodeId('Folder2'));
  clipboardService.copy();
  clipboardService.paste();

  t.true(
    sceneBuilder.isEqualTo(`
    Folder2
      Item1:
      Folder3
        Item2:
    Folder1
    Folder2
      Item1:
      Folder3
        Item2:
  `),
  );
});

test('Copy/paste nodes between scene collections', async t => {
  sceneBuilder.build(`
    Folder1
      Item1: color_source
      Item2: image_source
  `);

  selectionService.selectAll();
  clipboardService.copy();

  await sceneCollectionsService.create({ name: 'New Collection' });

  clipboardService.paste();

  t.true(
    sceneBuilder.isEqualTo(`
    Folder1
      Item1: color_source
      Item2: image_source
  `),
  );

  const sourcesCount = sourcesService.getSources().length;

  clipboardService.paste();

  t.true(
    sceneBuilder.isEqualTo(`
    Folder1
      Item1: color_source
      Item2: image_source
    Folder1
      Item1: color_source
      Item2: image_source
  `),
  );

  // the second paste call must not change the sources count
  t.is(sourcesService.getSources().length, sourcesCount);
});

test('Copy/paste filters between scene collections', async t => {
  sceneBuilder.build(`
      Item1: image_source
  `);

  sourceFiltersService.add(
    (getNode('Item1') as SceneItem).sourceId,
    'chroma_key_filter',
    'MyFilter',
  );

  selectionService.selectAll();
  clipboardService.copyFilters();

  await sceneCollectionsService.create({ name: 'Collection 2' });

  sceneBuilder.build(`
      Item1: image_source
  `);

  const sourceId = (getNode('Item1') as SceneItem).sourceId;

  selectionService.selectAll();
  clipboardService.pasteFilters();

  const filters = sourceFiltersService.getFilters(sourceId);

  t.is(filters.length, 1);

  const filter = filters[0];

  t.is(filter.name, 'MyFilter');
  t.is(filter.type, 'chroma_key_filter');
});

test('Copy/paste scenes between scene collections', async t => {
  // create a scene with nested scene

  await sceneCollectionsService.create({ name: 'Collection1' });

  sceneBuilder.build(`
    Folder1
      Item1: color_source
      Item2: image_source
  `);

  const scene1 = scenesService.getScenes()[0];
  const scene2 = scenesService.createScene('Scene2');
  scene2.makeActive();

  sceneBuilder.build(`
    Folder2
      Item3: color_source
      Item4: image_source
  `);

  scene1.makeActive();
  scene1.addSource(scene2.id);

  selectionService.selectAll();
  clipboardService.copy();

  await sceneCollectionsService.create({ name: 'Collection2' });

  clipboardService.paste();

  t.true(
    sceneBuilder.isEqualTo(`
    Scene2: scene
    Folder1
      Item1: color_source
      Item2: image_source
  `),
  );

  scenesService
    .getScenes()
    .find(scene => scene.name === 'Scene2')
    .makeActive();

  t.true(
    sceneBuilder.isEqualTo(`
    Folder2
      Item3: color_source
      Item4: image_source
  `),
  );
});

test('Copy/paste duplicate sources', async t => {
  sceneBuilder.build(`
    Folder1
      Item1: color_source
      Item2: image_source
  `);

  selectionService.selectAll();
  clipboardService.copy();
  const sourcesCount = selectionService.getSources().length;

  clipboardService.paste(true);

  t.true(
    sceneBuilder.isEqualTo(`
    Folder1
      Item1: color_source
      Item2: image_source
    Folder1
      Item1: color_source
      Item2: image_source
  `),
  );

  // check that sources also have been duplicated
  selectionService.selectAll();
  t.is(selectionService.getSources().length, sourcesCount * 2);
});
