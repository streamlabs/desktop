import { test, useWebdriver } from '../../helpers/webdriver';
import { ITestUser, logIn } from '../../helpers/webdriver/user';
import { getApiClient } from '../../helpers/api-client';
import { focusChild, focusMain } from '../../helpers/modules/core';
import { sleep } from '../../helpers/sleep';
import type { SourcesService } from '../../../app/services/sources';
import type {
  IStreamlabelDefinition,
  IStreamlabelSet,
  StreamlabelsService,
} from '../../../app/services/streamlabels';
import {
  closeWidgetWindow,
  getListRootByLabel,
  getTextByLabel,
  selectListByLabel,
  setTextByLabel,
  waitForLabel,
  waitForText,
} from '../../helpers/modules/widgets-ui';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

// Stream labels use a text source, its type depends on the platform
const STREAMLABEL_SOURCE_TYPE = process.platform === 'darwin' ? 'text_ft2_source' : 'text_gdiplus';

async function getServices() {
  const api = await getApiClient();
  return {
    sources: api.getResource<SourcesService>('SourcesService'),
    streamlabels: api.getResource<StreamlabelsService>('StreamlabelsService'),
  };
}

/**
 * Returns all labels that have a template ("format") setting
 */
async function getLabelsWithTemplate(streamlabels: StreamlabelsService) {
  const started = Date.now();
  while (Date.now() - started < 40000) {
    const definitions: IStreamlabelSet | null = streamlabels.state.definitions;
    if (definitions) {
      const files: IStreamlabelDefinition[] = [];
      Object.values(definitions).forEach(category =>
        category.files.forEach(file => {
          if (file.settings?.format) files.push(file);
        }),
      );
      if (files.length) return files;
    }
    await sleep(500);
  }
  throw new Error('Stream label definitions are not loaded');
}

function settingsStatOf(file: IStreamlabelDefinition) {
  return file.settings?.settingsStat ?? file.name;
}

async function openStreamlabelProperties(sourceId: string) {
  const { sources } = await getServices();
  sources.showSourceProperties(sourceId);
  await focusChild();
  await waitForLabel('Label Type', 40000);
}

async function waitFor(check: () => boolean, timeout = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (check()) return true;
    await sleep(250);
  }
  return false;
}

test('Stream label properties: change the template and reopen', async t => {
  const user = (await logIn(t, 'twitch')) as ITestUser;
  if (!user) return;

  const { sources, streamlabels } = await getServices();
  const [file] = await getLabelsWithTemplate(streamlabels);
  const statname = settingsStatOf(file);
  // restore the stat settings of the shared account even when the test fails
  const originalSettings = streamlabels.getSettingsForStat(statname);
  t.teardown(() => streamlabels.setSettingsForStat(statname, originalSettings));

  const source = sources.createSource(
    'Stream Label Source',
    STREAMLABEL_SOURCE_TYPE as any,
    {},
    { propertiesManager: 'streamlabels', propertiesManagerSettings: { statname: file.name } },
  );
  await focusMain();
  await openStreamlabelProperties(source.sourceId);

  // the form shows the selected label type, the template and the preview
  await waitForLabel('Label Template');
  await waitForLabel('Preview');
  await waitForText('Note: Actual label text may take up to 60 seconds to update');
  t.is(source.getPropertiesManagerSettings().statname, file.name);

  // change the template
  const template = `E2E template ${Date.now()}`;
  await setTextByLabel('Label Template', template);
  t.true(
    await waitFor(() => streamlabels.getSettingsForStat(statname).format === template),
    'template is saved in the streamlabels settings',
  );

  // reopen the window and make sure the template is loaded back
  await closeWidgetWindow();
  await openStreamlabelProperties(source.sourceId);
  t.is(await getTextByLabel('Label Template'), template);

  await closeWidgetWindow();
});

test('Stream label properties: change the label type', async t => {
  const user = (await logIn(t, 'twitch')) as ITestUser;
  if (!user) return;

  const { sources, streamlabels } = await getServices();
  const files = await getLabelsWithTemplate(streamlabels);
  if (files.length < 2) {
    t.log('Less than 2 labels with a template, skipping');
    t.pass();
    return;
  }
  const [first, second] = files;

  const source = sources.createSource(
    'Stream Label Type Source',
    STREAMLABEL_SOURCE_TYPE as any,
    {},
    { propertiesManager: 'streamlabels', propertiesManagerSettings: { statname: first.name } },
  );
  await focusMain();
  await openStreamlabelProperties(source.sourceId);

  // the selected label type is shown in the dropdown
  const $list = await getListRootByLabel('Label Type');
  t.true((await $list.getText()).includes(first.label));

  // select another label type
  await selectListByLabel('Label Type', second.label, true);
  t.true(
    await waitFor(() => source.getPropertiesManagerSettings().statname === second.name),
    'label type is saved in the properties manager settings',
  );

  // the template of the new label type is shown
  await waitForLabel('Label Template');

  // reopen the window, the new type is selected
  await closeWidgetWindow();
  await openStreamlabelProperties(source.sourceId);
  const $reopenedList = await getListRootByLabel('Label Type');
  t.true((await $reopenedList.getText()).includes(second.label));

  await closeWidgetWindow();
});
