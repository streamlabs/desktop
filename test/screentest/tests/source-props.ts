import { useWebdriver, test, afterAppStart } from '../../helpers/webdriver';
import { getApiClient } from '../../helpers/api-client';
import { ISourcesServiceApi, TSourceType } from '../../../app/services/sources/sources-api';
import { useScreentest } from '../screenshoter';
import { ScenesService } from 'services/scenes';
import { sleep } from '../../helpers/sleep';
import { focusChild } from '../../helpers/modules/core';

let showSourceProps: (name: string) => void;

useWebdriver({ restartAppAfterEachTest: false });
useScreentest();
afterAppStart(async t => {
  const types: TSourceType[] = [
    'image_source',
    'color_source',
    'browser_source',
    'slideshow',
    'ffmpeg_source',
    'text_gdiplus',
    'text_ft2_source',
    'monitor_capture',
    'window_capture',
    'game_capture',
    'dshow_input',
    'wasapi_input_capture',
    'wasapi_output_capture',
    'ndi_source',
  ];

  const client = await getApiClient();
  const scenesService = client.getResource<ScenesService>('ScenesService');
  const sourcesService = client.getResource<ISourcesServiceApi>('SourcesService');

  types.forEach(type => {
    scenesService.activeScene.createAndAddSource(type, type);
  });

  showSourceProps = async (name: string) => {
    const sourceId = sourcesService.getSourcesByName(name)[0].sourceId;
    sourcesService.showSourceProperties(sourceId);
    await focusChild();
  };
});

test('image_source', async t => {
  await showSourceProps('image_source');
  t.pass();
});

test('color_source', async t => {
  await showSourceProps('color_source');
  t.pass();
});

test('browser_source', async t => {
  await showSourceProps('browser_source');
  t.pass();
});

test('slideshow', async t => {
  await showSourceProps('slideshow');
  t.pass();
});

test('ffmpeg_source', async t => {
  await showSourceProps('ffmpeg_source');
  t.pass();
});

test('text_gdiplus', async t => {
  await showSourceProps('text_gdiplus');
  await sleep(1500); // the font selector rendering is very slow
  t.pass();
});

test('text_ft2_source', async t => {
  await showSourceProps('text_ft2_source');
  await sleep(1500); // the font selector rendering is very slow
  t.pass();
});

test('monitor_capture', async t => {
  await showSourceProps('monitor_capture');
  t.pass();
});

test('game_capture', async t => {
  await showSourceProps('game_capture');
  t.pass();
});

test('dshow_input', async t => {
  await showSourceProps('dshow_input');
  t.pass();
});

test('wasapi_input_capture', async t => {
  await showSourceProps('wasapi_input_capture');
  t.pass();
});

test('wasapi_output_capture', async t => {
  await showSourceProps('wasapi_output_capture');
  t.pass();
});

test('ndi_source', async t => {
  await showSourceProps('ndi_source');
  t.pass();
});
