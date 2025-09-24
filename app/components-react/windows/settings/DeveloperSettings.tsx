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

export function DeveloperSettings() {
  const {
    TcpServerService,
    PlatformAppsService,
    OverlaysPersistenceService,
    SceneCollectionsService,
  } = Services;

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

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
        <ObsSettingsSection>{/* <AppPlatformDeveloperSettings /> */}</ObsSettingsSection>
      )}
      <ObsSettingsSection>
        <Button className="button--soft-warning" onClick={restoreDefaults}>
          {$t('Restore Defaults')}
        </Button>
      </ObsSettingsSection>
      <ObsSettingsSection title={$t('Manage Dual Output Scene')}>
        <span>
          {$t(
            'The below will create a copy of the active scene collection, set the copy as the active collection, and then apply the function.',
          )}
        </span>
        <div>
          <h4>{$t('Convert to Vanilla Scene')}</h4>
          <Button
            className="button--soft-warning"
            onClick={() => convertDualOutputCollection()}
            disabled={busy}
          >
            {$t('Convert')}
          </Button>
          <Button
            className="button--soft-warning"
            onClick={() => convertDualOutputCollection(false, true)}
            disabled={busy}
          >
            {$t('Convert and Export Overlay')}
          </Button>
        </div>
        <div style={{ marginTop: '10px' }}>
          <h4>{$t('Assign Vertical Sources to Horizontal Display')}</h4>
          <Button
            className="button--soft-warning"
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
        <div style={{ color: error ? 'red' : 'var(--teal)' }}>{message}</div>
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

DeveloperSettings.page = 'Developer';
