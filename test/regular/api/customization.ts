import { useWebdriver, test } from '../../helpers/webdriver';
import { getApiClient } from '../../helpers/api-client';
import { focusWindow, getClient } from '../../helpers/modules/core';
import { CustomizationService } from '../../../app/services/api/external-api/customization/customization';

// This is the test harness, not a React hook.
// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver({ restartAppAfterEachTest: false });

// Look the resource up inside each test. Returning it from an async helper makes the promise
// look up `then` on the proxy, which the API client forwards to the app as a remote call.

/** Read the setting from the service that backs the API, in the worker. */
async function dockCollapsed(): Promise<boolean> {
  await focusWindow('worker');
  return getClient().execute(
    () =>
      (window as any).servicesManager.getResource('CustomizationService').state
        .dockCollapsed as boolean,
  );
}

/**
 * Call `getModel()` on the API resource in the worker and return only the dock fields.
 *
 * It can't be requested over the API yet: the response includes the embedded `pinnedStatistics`
 * Realm object, and `RpcApi.serializePayload` reads `schema.name` from the payload rather than
 * from the nested object, throwing a TypeError. Calling the resource in-process skips that
 * serialization, so this checks the model but not its transport.
 */
async function apiModelDockState(): Promise<{
  dockCollapsed: boolean;
  livedockCollapsed: boolean;
}> {
  await focusWindow('worker');
  return getClient().execute(() => {
    const manager = (window as any).servicesManager;
    const resource = manager.getResource('ExternalApiService').getResource('CustomizationService');
    const { dockCollapsed, livedockCollapsed } = resource.getModel();
    return { dockCollapsed, livedockCollapsed };
  });
}

test('The model reports the dock state under both the new and the deprecated name', async t => {
  const client = await getApiClient();
  const customization = client.getResource<CustomizationService>('CustomizationService');

  customization.setSettings({ dockCollapsed: false });
  t.deepEqual(await apiModelDockState(), { dockCollapsed: false, livedockCollapsed: false });

  customization.setSettings({ dockCollapsed: true });
  t.deepEqual(await apiModelDockState(), { dockCollapsed: true, livedockCollapsed: true });
});

test('The dockCollapsed setting collapses and expands the dock', async t => {
  const client = await getApiClient();
  const customization = client.getResource<CustomizationService>('CustomizationService');

  customization.setSettings({ dockCollapsed: false });
  t.false(await dockCollapsed());

  customization.setSettings({ dockCollapsed: true });
  t.true(await dockCollapsed());
});

test('The deprecated livedockCollapsed setting still collapses the dock', async t => {
  const client = await getApiClient();
  const customization = client.getResource<CustomizationService>('CustomizationService');

  customization.setSettings({ livedockCollapsed: false });
  t.false(await dockCollapsed());

  customization.setSettings({ livedockCollapsed: true });
  t.true(await dockCollapsed());

  customization.setLiveDockCollapsed(false);
  t.false(await dockCollapsed());
});

test('dockCollapsed wins over livedockCollapsed when both are set', async t => {
  const client = await getApiClient();
  const customization = client.getResource<CustomizationService>('CustomizationService');

  customization.setSettings({ dockCollapsed: true, livedockCollapsed: false });
  t.true(await dockCollapsed());

  customization.setSettings({ dockCollapsed: false, livedockCollapsed: true });
  t.false(await dockCollapsed());
});
