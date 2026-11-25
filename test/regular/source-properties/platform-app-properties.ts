import { test, useWebdriver } from '../../helpers/webdriver';
import { getApiClient } from '../../helpers/api-client';
import { focusChild, focusMain } from '../../helpers/modules/core';
import type { SourcesService } from '../../../app/services/sources';
import {
  closeWidgetWindow,
  getWindowsService,
  isLabelDisplayed,
  waitForChildWindowState,
  waitForLabel,
  waitForText,
} from '../../helpers/modules/widgets-ui';

// not a react hook
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

/**
 * There is no platform app installed in the test environment, so this covers the properties window
 * of a source whose app is gone (uninstalled / unsubscribed). The "app is installed" branch
 * ("This source is managed by <app>", "Open App Settings", the unpacked-app debug URL) needs a real
 * platform app and is not covered here.
 */
test('Platform app source properties for a source of an uninstalled app', async t => {
  const api = await getApiClient();
  const sources = api.getResource<SourcesService>('SourcesService');

  const source = sources.createSource(
    'Missing App Source',
    'browser_source',
    {},
    {
      propertiesManager: 'platformApp',
      propertiesManagerSettings: {
        appId: 'e2e-missing-app',
        appSourceId: 'e2e-missing-source',
        appSettings: '',
      },
    },
  );

  sources.showSourceProperties(source.sourceId);
  t.true(await waitForChildWindowState('SourcePropertiesDeprecated', true), 'properties are shown');
  await focusChild();

  // the custom platform app section is shown instead of the app controls
  await waitForText('This app has been uninstalled and this source should be removed.', 40000);
  t.is(source.getPropertiesManagerSettings().appId, 'e2e-missing-app');

  // the regular source properties are still available, except the url that is managed by the app
  await waitForLabel('Width');
  await waitForLabel('Height');
  t.false(await isLabelDisplayed('URL'));

  const windows = await getWindowsService();
  t.is(windows.getChildWindowOptions().queryParams.sourceId, source.sourceId);

  await closeWidgetWindow();
  t.true(await waitForChildWindowState('SourcePropertiesDeprecated', false), 'properties closed');
  await focusMain();
});
