import { test, useWebdriver } from '../helpers/webdriver';
import { focusWindow } from '../helpers/modules/core';

// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('Simple VOD initializes track 2 once and preserves source exclusions on later settings saves', async t => {
  t.true(await focusWindow('worker'));
  const result = (await t.context.app.client.execute(() => {
    const get = (name: string) => (window as any).servicesManager.getResource(name);
    const osn = require('obs-studio-node');
    const originalSave = osn.NodeObs.OBS_settings_saveSettings;
    const settings = Object.create(get('SettingsService'));
    const audio = Object.create(get('AudioService'));
    const sources = [
      { sourceId: 'live-and-track-6', audioMixers: 33 },
      { sourceId: 'track-6-only', audioMixers: 32 },
      { sourceId: 'live-only', audioMixers: 1 },
    ];
    let views = { isSimpleOutputMode: true, vodTrackEnabled: false };
    let nextViews = views;
    const calls: boolean[] = [];
    Object.defineProperty(audio, 'views', { value: { getSources: () => sources } });
    audio.setSettings = (sourceId: string, patch: { audioMixers: number }) =>
      Object.assign(
        sources.find(source => source.sourceId === sourceId),
        patch,
      );
    Object.defineProperty(settings, 'views', { get: () => views });
    Object.defineProperty(settings, 'audioService', {
      value: {
        setSimpleTracks: (includeVod: boolean) => {
          calls.push(!!includeVod);
          audio.setSimpleTracks(includeVod);
        },
      },
    });
    settings.loadSettingsIntoStore = () => (views = nextViews);
    const form = [{ nameSubCategory: 'Untitled', parameters: [{ name: 'Mode', value: 'Simple' }] }];
    try {
      osn.NodeObs.OBS_settings_saveSettings = () => {};
      // Reloaded metadata is authoritative, including a saved VOD flag that was
      // hidden while UseAdvanced was disabled in the submitted form.
      nextViews = { isSimpleOutputMode: true, vodTrackEnabled: true };
      settings.setSettings('Output', form);
      const initialized = sources.map(source => source.audioMixers);
      sources[0].audioMixers &= ~2;
      settings.setSettings('Output', form);
      const afterBitrateSave = sources.map(source => source.audioMixers);
      views = nextViews = { isSimpleOutputMode: false, vodTrackEnabled: true };
      settings.setSettings('Output', []);
      const afterAdvancedSave = sources.map(source => source.audioMixers);
      nextViews = { isSimpleOutputMode: true, vodTrackEnabled: false };
      settings.setSettings('Output', form);
      return {
        initialized,
        afterBitrateSave,
        afterAdvancedSave,
        afterDisabled: sources.map(source => source.audioMixers),
        calls,
      };
    } finally {
      osn.NodeObs.OBS_settings_saveSettings = originalSave;
    }
  })) as {
    initialized: number[];
    afterBitrateSave: number[];
    afterAdvancedSave: number[];
    afterDisabled: number[];
    calls: boolean[];
  };
  t.deepEqual(result.initialized, [35, 32, 3]);
  t.deepEqual(result.afterBitrateSave, [33, 32, 3]);
  t.deepEqual(result.afterAdvancedSave, [33, 32, 3]);
  t.deepEqual(result.afterDisabled, [1, 1, 1]);
  t.deepEqual(result.calls, [true, false]);
});
