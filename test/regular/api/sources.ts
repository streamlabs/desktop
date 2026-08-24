import { useWebdriver, test } from '../../helpers/webdriver';
import { getApiClient } from '../../helpers/api-client';
import { ScenesService } from 'services/api/external-api/scenes/scenes';
import { SourcesService } from 'services/api/external-api/sources/sources';
import { Source } from 'services/api/external-api/sources';
import { platform } from 'os';
import { SceneItem } from 'services/api/external-api/scenes/scene-item';

useWebdriver({ restartAppAfterEachTest: false });

test('Creating, fetching and removing sources', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const sourcesService = client.getResource<SourcesService>('SourcesService');
  const scene = scenesService.activeScene;

  const colorSource1 = sourcesService.createSource('MyColorSource1', 'color_source');
  const colorItem2 = scene.createAndAddSource('MyColorSource2', 'color_source');

  const sources = sourcesService.getSources();

  t.truthy(colorSource1.id); // id field is necessary for Streamdeck
  t.truthy(sources.find(source => source.name === 'MyColorSource1'));
  t.truthy(sources.find(source => source.name === 'MyColorSource2'));

  const colorItem1 = scene.addSource(colorSource1.sourceId);
  let sceneItemNames = scene.getItems().map(item => item['name']);

  t.deepEqual(sceneItemNames, ['MyColorSource1', 'MyColorSource2']);

  scene.removeItem(colorItem1.id);
  colorItem2.remove();
  sceneItemNames = scene.getItems().map(item => item['name']);

  t.deepEqual(sceneItemNames, []);
});

test('Source events', async t => {
  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const sourcesService = client.getResource<SourcesService>('SourcesService');

  sourcesService.sourceAdded.subscribe(() => void 0);
  sourcesService.sourceRemoved.subscribe(() => void 0);
  sourcesService.sourceUpdated.subscribe(() => void 0);

  // check `sourceAdded` event after `createSource` call
  let source1: Source = null;
  let eventPromise = client.fetchNextEvent();
  if (platform() === 'win32') {
    source1 = sourcesService.createSource('audio1', 'wasapi_output_capture');
  } else if (platform() === 'darwin') {
    source1 = sourcesService.createSource('audio1', 'coreaudio_output_capture');
  }

  if (!source1) {
    t.fail('Failed to create source');
    return;
  }

  let event = await eventPromise;
  t.is(event.data.name, 'audio1');
  t.truthy(event.data.id); // id field is necessary for Streamdeck

  // check `sourceAdded` event after `createAndAddSource` call
  let item2: SceneItem = null;
  eventPromise = client.fetchNextEvent();
  if (platform() === 'win32') {
    item2 = scenesService.activeScene.createAndAddSource('audio2', 'wasapi_output_capture');
  } else if (platform() === 'darwin') {
    item2 = scenesService.activeScene.createAndAddSource('audio2', 'coreaudio_output_capture');
  }

  if (!item2) {
    t.fail('Failed to create scene item');
    return;
  }

  event = await eventPromise;
  t.is(event.data.name, 'audio2');

  // check `sourceRemoved` event
  eventPromise = client.fetchNextEvent();
  item2.remove();
  event = await eventPromise;
  t.is(event.data.name, 'audio2');

  // check `sourceUpdated` event when renaming a source
  eventPromise = client.fetchNextEvent();
  source1.setName('audio3');
  event = await eventPromise;

  // the remote control app requires these fields to be in the event
  t.is(event.data.name, 'audio3');
  t.is(event.data.configurable, true);
  t.truthy(event.data.resourceId);
});
