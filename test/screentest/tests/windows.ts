import test from 'ava';
import { ScenesService } from 'services/scenes';
import { ISettingsServiceApi } from '../../../app/services/settings';
import { ISourcesServiceApi } from '../../../app/services/sources/sources-api';
import { getApiClient } from '../../helpers/api-client';
import { useWebdriver } from '../../helpers/webdriver';
import { useScreentest } from '../screenshoter';

useWebdriver({ restartAppAfterEachTest: false });
useScreentest({ window: 'child' });

test('Sources showcase window', async t => {
  const client = await getApiClient();
  const sourcesService = client.getResource<ISourcesServiceApi>('SourcesService');
  sourcesService.showShowcase();
  t.pass();
});

test('AddSource window', async t => {
  const client = await getApiClient();
  const sourcesService = client.getResource<ISourcesServiceApi>('SourcesService');
  sourcesService.showAddSource('color_source');
  t.pass();
});

test('AddSource window with suggestions', async t => {
  const client = await getApiClient();
  const sourcesService = client.getResource<ISourcesServiceApi>('SourcesService');
  const scenesService = client.getResource<ScenesService>('ScenesService');
  scenesService.activeScene.createAndAddSource('MySource', 'color_source');
  sourcesService.showAddSource('color_source');
  t.pass();
});

test('Settings General', async t => {
  const client = await getApiClient();
  const settingsService = client.getResource<ISettingsServiceApi>('SettingsService');
  settingsService.showSettings();
  t.pass();
});

test('Settings Stream', async t => {
  const client = await getApiClient();
  const settingsService = client.getResource<ISettingsServiceApi>('SettingsService');
  settingsService.showSettings('Stream');
  t.pass();
});

test('Settings Output', async t => {
  const client = await getApiClient();
  const settingsService = client.getResource<ISettingsServiceApi>('SettingsService');
  settingsService.showSettings('Output');
  t.pass();
});

test('Settings Video', async t => {
  const client = await getApiClient();
  const settingsService = client.getResource<ISettingsServiceApi>('SettingsService');
  settingsService.showSettings('Video');
  t.pass();
});

test('Settings Hotkeys', async t => {
  const client = await getApiClient();
  const settingsService = client.getResource<ISettingsServiceApi>('SettingsService');
  settingsService.showSettings('Hotkeys');
  t.pass();
});

test('Settings Scene Collections', async t => {
  const client = await getApiClient();
  const settingsService = client.getResource<ISettingsServiceApi>('SettingsService');
  settingsService.showSettings('Scene Collections');
  t.pass();
});

test('Settings Notifications', async t => {
  const client = await getApiClient();
  const settingsService = client.getResource<ISettingsServiceApi>('SettingsService');
  settingsService.showSettings('Notifications');
  t.pass();
});

test('Settings Appearance', async t => {
  const client = await getApiClient();
  const settingsService = client.getResource<ISettingsServiceApi>('SettingsService');
  settingsService.showSettings('Appearance');
  t.pass();
});
