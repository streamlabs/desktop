import React, { useState } from 'react';
import { Button as AntButton } from 'antd';
import * as remote from '@electron/remote';
import path from 'path';
import { $t } from 'services/i18n/index';
import { Services } from 'components-react/service-provider';
import { useRealmObject } from 'components-react/hooks/realm';
import { useVuex } from 'components-react/hooks';
import { DualOutputDeveloperSettings } from './Developer';
import { ObsSettingsSection } from './ObsSettings';
import { CheckboxInput, SwitchInput, ListInput } from 'components-react/shared/inputs';

export function SceneCollectionsSettings() {
  const {
    SceneCollectionsService,
    OverlaysPersistenceService,
    WidgetsService,
    ScenesService,
    CustomizationService,
  } = Services;

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [collection, setCollection] = useState(SceneCollectionsService.activeCollection?.id || '');

  const mediaBackupOptOut = useRealmObject(CustomizationService.state).mediaBackupOptOut;
  const designerMode = useRealmObject(CustomizationService.state).designerMode;

  const { activeSceneId, collectionOptions } = useVuex(() => ({
    activeSceneId: ScenesService.views.activeSceneId,
    collectionOptions: SceneCollectionsService.collections.map(coll => ({
      label: coll.name,
      value: coll.id,
    })),
  }));

  function setMediaBackupOptOut(value: boolean) {
    CustomizationService.actions.setMediaBackupOptOut(value);
  }

  function setDesignerMode(value: boolean) {
    CustomizationService.actions.setSettings({ designerMode: value });
  }

  async function saveOverlay() {
    const { filePath } = await remote.dialog.showSaveDialog({
      filters: [{ name: 'Overlay File', extensions: ['overlay'] }],
    });

    if (!filePath) return;

    setBusy(true);
    setMessage('');

    // TODO: Expose progress to the user
    await OverlaysPersistenceService.actions.return.saveOverlay(filePath);
    setBusy(false);
    setMessage(
      $t('Successfully saved %{filename}', {
        filename: path.parse(filePath).base,
      }),
    );
  }

  async function loadOverlay() {
    const chosenPath = (
      await remote.dialog.showOpenDialog({
        filters: [{ name: 'Overlay File', extensions: ['overlay'] }],
      })
    ).filePaths;

    if (!chosenPath[0]) return;

    setBusy(true);
    setMessage('');

    const filename = path.parse(chosenPath[0]).name;
    const configName = await SceneCollectionsService.actions.return.suggestName(filename);

    await SceneCollectionsService.actions.return.loadOverlay(chosenPath[0], configName);
    setBusy(false);
    setMessage($t('Successfully loaded %{filename}.overlay', { filename }));
  }

  async function loadWidget() {
    const chosenPath = (
      await remote.dialog.showOpenDialog({
        filters: [{ name: 'Widget File', extensions: ['widget'] }],
      })
    ).filePaths;

    if (!chosenPath[0]) return;

    setBusy(true);
    setMessage('');

    await WidgetsService.actions.return.loadWidgetFile(chosenPath[0], activeSceneId);
    setBusy(false);
  }

  async function createSceneCollection() {
    // TODO: don't have a way to prompt for name, rather port this to React
    const name = await SceneCollectionsService.actions.return.suggestName('Scenes');
    SceneCollectionsService.actions.create({ name });
  }

  function Button(p: React.PropsWithChildren<{ onClick: () => void }>) {
    return (
      <AntButton onClick={p.onClick} type="primary">
        {p.children}
        {busy && <i className="fa fa-spinner fa-pulse" style={{ marginLeft: '5px' }} />}
      </AntButton>
    );
  }

  return (
    <>
      <ObsSettingsSection>
        <div style={{ display: 'flex', justifyContent: 'space-evenly', paddingBottom: '16px' }}>
          <Button onClick={createSceneCollection}>{$t('Create Scene Collection')}</Button>
          <Button onClick={loadWidget}>{$t('Import Widget File in Current Scene')}</Button>
        </div>
      </ObsSettingsSection>
      <ObsSettingsSection>
        <p>
          {$t(
            'This feature is intended for overlay designers to export their work for our Overlay Library. Not all sources will be exported, use at your own risk.',
          )}
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-evenly', paddingBottom: '16px' }}>
          <Button onClick={saveOverlay}>{$t('Export Overlay File')}</Button>
          <Button onClick={loadOverlay}>{$t('Import Overlay File')}</Button>
        </div>
        <SwitchInput
          label={$t('Enable Designer Mode')}
          value={designerMode}
          onChange={setDesignerMode}
        />
        {message}
      </ObsSettingsSection>
      <ObsSettingsSection>
        <CheckboxInput
          label={$t('Do not back up my media files in the cloud (requires app restart)')}
          value={mediaBackupOptOut}
          onChange={setMediaBackupOptOut}
        />
      </ObsSettingsSection>
      <ObsSettingsSection title={$t('Manage Dual Output Scene')}>
        <ListInput
          label={$t('Scene Collection')}
          value={collection}
          onChange={setCollection}
          options={collectionOptions}
        />
        <DualOutputDeveloperSettings collection={collection} />
      </ObsSettingsSection>
    </>
  );
}
