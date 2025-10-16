import React, { useEffect, useState } from 'react';
import remote from '@electron/remote';
import path from 'path';
import { Button } from 'antd';
import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import { ObsSettingsSection } from './ObsSettings';
import FormFactory from 'components-react/shared/inputs/FormFactory';
import { TextInput } from 'components-react/shared/inputs';
import { metadata } from 'components-react/shared/inputs/metadata';

export function DeveloperSettings() {
  const { TcpServerService, PlatformAppsService } = Services;

  const { tokenInput, appDeveloperMode, apiMeta, apiValues } = useVuex(() => ({
    tokenInput: TcpServerService.state.token,
    appDeveloperMode: PlatformAppsService.state.devMode,
    apiMeta: TcpServerService.views.metadata,
    apiValues: TcpServerService.views.settings,
  }));

  useEffect(() => {
    // Stop listening for security reasons
    TcpServerService.actions.stopListening();

    return () => {
      TcpServerService.actions.listen();
    };
  }, []);

  function generateToken() {
    TcpServerService.actions.generateToken();
  }

  function restoreDefaults() {
    TcpServerService.actions.restoreDefaultSettings();
  }

  function handleNamedPipeChange(key: string) {
    return (value: boolean | string) => {
      TcpServerService.actions.setSettings({ namedPipe: { ...apiValues.namedPipe, [key]: value } });
    };
  }

  function handleWebsocketsChange(key: string) {
    return (value: boolean | number) => {
      TcpServerService.actions.setSettings({
        websockets: { ...apiValues.websockets, [key]: value },
      });
    };
  }

  return (
    <>
      {appDeveloperMode && (
        <ObsSettingsSection title={$t('App Platform')}>
          <AppPlatformDeveloperSettings />
        </ObsSettingsSection>
      )}
      <ObsSettingsSection title={$t('Manage Dual Output Scene')}>
        <DualOutputDeveloperSettings />
      </ObsSettingsSection>
      <ObsSettingsSection>
        <Button className="button--soft-warning" onClick={restoreDefaults}>
          {$t('Restore Defaults')}
        </Button>
        <div style={{ padding: '8px' }} />
      </ObsSettingsSection>
      <ObsSettingsSection>
        <TextInput
          label={$t('API Token')}
          value={tokenInput}
          isPassword
          addonAfter={<Button onClick={generateToken}>{$t('Update')}</Button>}
        />
      </ObsSettingsSection>
      <ObsSettingsSection title={$t('Named Pipe')}>
        <FormFactory
          values={apiValues.namedPipe}
          metadata={apiMeta.namedPipe}
          onChange={handleNamedPipeChange}
        />
      </ObsSettingsSection>
      <ObsSettingsSection title={$t('Websockets')}>
        <FormFactory
          values={apiValues.websockets}
          metadata={apiMeta.websockets}
          onChange={handleWebsocketsChange}
        />
      </ObsSettingsSection>
    </>
  );
}

export function DualOutputDeveloperSettings(p: { collection?: string }) {
  const { OverlaysPersistenceService, SceneCollectionsService } = Services;

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  /**
   * Convert a dual output scene collection to a vanilla scene collection
   * @param assignToHorizontal Boolean for if the vertical sources should be assigned to the
   * horizontal display or should be deleted
   * @param exportOverlay Boolean for is the scene collection should be exported upon completion
   */
  async function convertDualOutputCollection(
    assignToHorizontal: boolean = false,
    exportOverlay: boolean = false,
  ) {
    // confirm that the active scene collection is a dual output collection
    if (
      !SceneCollectionsService?.sceneNodeMaps ||
      (SceneCollectionsService?.sceneNodeMaps &&
        Object.values(SceneCollectionsService?.sceneNodeMaps).length === 0)
    ) {
      setError(true);
      setMessage($t('The active scene collection is not a dual output scene collection.'));
      return;
    }
    if (exportOverlay) {
      const { filePath } = await remote.dialog.showSaveDialog({
        filters: [{ name: 'Overlay File', extensions: ['overlay'] }],
      });
      if (!filePath) return;
      setBusy(true);

      // convert collection
      const collectionFilePath = await SceneCollectionsService.actions.return.convertDualOutputCollection(
        assignToHorizontal,
        p.collection,
      );

      if (!collectionFilePath) {
        setError(true);
        setMessage($t('Unable to convert dual output collection.'));
        return;
      }

      // save overlay
      OverlaysPersistenceService.actions.return.saveOverlay(filePath).then(() => {
        setError(false);
        setBusy(false);
        setMessage(
          $t('Successfully saved %{filename} to %{filepath}', {
            filename: path.parse(collectionFilePath).base,
            filepath: filePath,
          }),
        );
      });
    } else {
      setBusy(true);

      // convert collection
      const filePath = await SceneCollectionsService.actions.return.convertDualOutputCollection(
        assignToHorizontal,
      );

      if (filePath) {
        setError(false);
        setMessage(
          $t('Successfully converted %{filename}', {
            filename: path.parse(filePath).base,
          }),
        );
      } else {
        setError(true);
        setMessage($t('Unable to convert dual output collection.'));
      }
      setBusy(false);
    }
  }

  return (
    <>
      <span>
        {$t(
          'The below will create a copy of the active scene collection, set the copy as the active collection, and then apply the function.',
        )}
      </span>
      <div>
        <h4>{$t('Convert to Vanilla Scene')}</h4>
        <Button
          className="button--soft-warning"
          style={{ marginRight: '16px' }}
          onClick={() => convertDualOutputCollection()}
          disabled={busy}
        >
          {$t('Convert')}
        </Button>
        {!p.collection && (
          <Button
            className="button--soft-warning"
            onClick={() => convertDualOutputCollection(false, true)}
            disabled={busy}
          >
            {$t('Convert and Export Overlay')}
          </Button>
        )}
      </div>
      {!p.collection && (
        <div style={{ marginTop: '10px' }}>
          <h4>{$t('Assign Vertical Sources to Horizontal Display')}</h4>
          <Button
            className="button--soft-warning"
            style={{ marginRight: '16px' }}
            onClick={() => convertDualOutputCollection(true)}
            disabled={busy}
          >
            {$t('Assign')}
          </Button>
          <Button
            className="button--soft-warning"
            onClick={() => convertDualOutputCollection(true, true)}
            disabled={busy}
          >
            {$t('Assign and Export Overlay')}
          </Button>
        </div>
      )}
      <div style={{ color: error ? 'red' : 'var(--teal)' }}>{message}</div>
      <div style={{ padding: '8px' }} />
    </>
  );
}

function AppPlatformDeveloperSettings() {
  const { PlatformAppsService } = Services;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { loadedUnpackedApp } = useVuex(() => ({
    loadedUnpackedApp:
      PlatformAppsService.views.enabledApps.length === 0
        ? null
        : PlatformAppsService.views.enabledApps.find(app => app.unpacked),
  }));

  const [s, setAppState] = useState({
    appPath: loadedUnpackedApp?.appPath || '',
    appToken: loadedUnpackedApp?.appToken || '',
  });

  const meta = {
    appPath: metadata.file({
      label: $t('Unpacked App Path'),
      directory: true,
      tooltip: $t(
        'This is the path to your unpacked app. It should be a folder containing a valid manifest.json',
      ),
    }),
    appToken: metadata.text({
      label: $t('App Token'),
      tooltip: $t(
        'This token allows you app to authenticate with the Streamlabs API. Visit platform.streamlabs.com to create a developer account and get a test app token.',
      ),
    }),
  };

  function handleFormChange(key: string) {
    return (value: string) => {
      setAppState({ ...s, [key]: value });
    };
  }

  async function loadApp() {
    if (!s.appPath || !s.appToken) return;
    if (loadedUnpackedApp) {
      await PlatformAppsService.actions.return.unloadApp(loadedUnpackedApp);
    }
    setLoading(true);

    try {
      setError(await PlatformAppsService.actions.return.loadUnpackedApp(s.appPath, s.appToken));
    } catch (e: unknown) {
      setError(
        $t(
          'There was an error loading this app, please try again or contact the Streamlabs development team for assistance.',
        ),
      );
    }

    setLoading(false);
  }

  async function reloadApp() {
    if (!loadedUnpackedApp) return;
    setLoading(true);
    setError('');

    try {
      setError(await PlatformAppsService.actions.return.refreshApp(loadedUnpackedApp.id));
    } catch (e: unknown) {
      setError(
        $t(
          'There was an error loading this app, please try again or contact the Streamlabs development team for assistance.',
        ),
      );
    }

    setLoading(false);
  }

  function unloadApp() {
    if (!loadedUnpackedApp) return;
    PlatformAppsService.actions.unloadApp(loadedUnpackedApp);
  }

  return (
    <>
      {loadedUnpackedApp && (
        <>
          <h4>{$t('Currently Loaded App')}</h4>
          <p style={{ wordWrap: 'break-word' }}>
            {loadedUnpackedApp.manifest.name}
            {loadedUnpackedApp.manifest.version}
          </p>
          <h4>{$t('Path')}</h4>
          <p style={{ wordWrap: 'break-word' }}>{loadedUnpackedApp.appPath}</p>
          <h4>{$t('Token')}</h4>
          <p style={{ wordWrap: 'break-word' }}>{loadedUnpackedApp.appToken}</p>
          <Button onClick={reloadApp} type="primary" disabled={loading}>
            {$t('Reload')}
            {loading && <i className="fa fa-spinner fa-pulse" />}
          </Button>
          <Button onClick={unloadApp} type="primary" disabled={loading}>
            {$t('Unload')}
            {loading && <i className="fa fa-spinner fa-pulse" />}
          </Button>
        </>
      )}
      {!loadedUnpackedApp && (
        <>
          <FormFactory values={s} metadata={meta} onChange={handleFormChange} />
          <Button onClick={loadApp} type="primary" disabled={loading}>
            {$t('Load App')}
            {loading && <i className="fa fa-spinner fa-pulse" />}
          </Button>
          {error && <div style={{ color: 'var(--warning)', fontSize: '12px' }}>{error}</div>}
          <div style={{ padding: '8px' }} />
        </>
      )}
    </>
  );
}
