import { test, TExecutionContext, useWebdriver } from '../../helpers/webdriver';
import { ISceneCollectionsServiceApi } from '../../../app/services/scene-collections';
import { getApiClient } from '../../helpers/api-client';
import { click, closeWindow, focusChild, focusMain } from '../../helpers/modules/core';
import { useForm } from '../../helpers/modules/forms';
import { showSettingsWindow } from '../../helpers/modules/settings/settings';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

async function clickAdvancedAudio(t: TExecutionContext) {
  const $mixer = await t.context.app.client.$('h2=Mixer');
  const $settings = await (await $mixer.$('..')).$('.icon-settings');
  await $settings.click();
}

const DEFAULT_AUDIO_SETTINGS = {
  // TODO: Fix slider inputs for form
  // deflection: 100,
  streamTrack: true,
};

const DEFAULT_DETAIL_SETTINGS = {
  forceMono: false,
  syncOffset: 0,
  // TODO: Fix input recognition of lists
  // monitoringType: '0',
};

test('Change Advanced Audio Settings', async t => {
  await showSettingsWindow('Output');
  const { fillForm } = useForm('Mode');
  await fillForm({ Mode: 'Advanced' });
  await closeWindow('child');
  await focusMain();

  await clickAdvancedAudio(t);
  await focusChild();
  await click('.ant-collapse-arrow');

  // check default settings
  const headerForm = useForm('advanced-audio-header');
  const detailForm = useForm('advanced-audio-detail');
  await headerForm.assertFormContains(DEFAULT_AUDIO_SETTINGS);
  await detailForm.assertFormContains(DEFAULT_DETAIL_SETTINGS);

  // update settings
  const updatedAudioSettings = {
    // deflection: 50,
    streamTrack: false,
  };
  await headerForm.fillForm(updatedAudioSettings);
  await headerForm.assertFormContains(updatedAudioSettings);

  const updatedDetailSettings = {
    forceMono: true,
    syncOffset: 1000,
    // monitoringType: '1',
  };
  await detailForm.fillForm(updatedDetailSettings);
  await detailForm.assertFormContains(updatedDetailSettings);

  // check settings are still updated after window close
  await closeWindow('child');
  await focusMain();
  await clickAdvancedAudio(t);
  await focusChild();
  await click('.ant-collapse-arrow');

  await headerForm.assertFormContains(updatedAudioSettings);
  await detailForm.assertFormContains(updatedDetailSettings);

  // reload config
  const apiClient = await getApiClient();
  const sceneCollectionsService = apiClient.getResource<ISceneCollectionsServiceApi>(
    'SceneCollectionsService',
  );
  await sceneCollectionsService.load(sceneCollectionsService.collections[0].id);

  // check settings are still updated after config reload
  await focusMain();
  await clickAdvancedAudio(t);
  await focusChild();
  await click('.ant-collapse-arrow');

  await headerForm.assertFormContains(updatedAudioSettings);
  await detailForm.assertFormContains(updatedDetailSettings);

  t.pass();
});
