import React, { useState } from 'react';
import * as remote from '@electron/remote';
import path from 'path';
import { $t } from 'services/i18n/index';
import { Services } from 'components-react/service-provider';
import { useRealmObject } from 'components-react/hooks/realm';
import { useVuex } from 'components-react/hooks';

export function OverlaySettings() {
  const {
    SceneCollectionsService,
    OverlaysPersistenceService,
    AppService,
    WidgetsService,
    ScenesService,
    CustomizationService,
  } = Services;

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const [collection, setCollection] = useState(SceneCollectionsService.activeCollection?.id || '');

  const mediaBackupOptOut = useRealmObject(CustomizationService.state).mediaBackupOptOut;
  const designerMode = useRealmObject(CustomizationService.state).designerMode;

  const { activeSceneId } = useVuex(() => ({
    activeSceneId: ScenesService.views.activeSceneId,
  }));

  function setMediaBackupOptOut(value: boolean) {
    CustomizationService.actions.setMediaBackupOptOut(value);
  }

  function setDesignerMode(value: boolean) {
    CustomizationService.actions.setSettings({ designerMode: value });
  }

  // get collectionOptions() {
  //   return this.sceneCollectionsService.collections.map(collection => ({
  //     title: collection.name,
  //     value: collection.id,
  //   }));
  // }

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

  // /**
  //  * Convert a dual output scene collection to a vanilla scene collection
  //  * @param assignToHorizontal Boolean for if the vertical sources should be assigned to the
  //  * horizontal display or should be deleted
  //  * @param exportOverlay Boolean for is the scene collection should be exported upon completion
  //  */
  // async convertDualOutputCollection(
  //   assignToHorizontal: boolean = false,
  //   exportOverlay: boolean = false,
  // ) {
  //   // confirm that the active scene collection is a dual output collection
  //   if (
  //     !this.sceneCollectionsService?.sceneNodeMaps ||
  //     (this.sceneCollectionsService?.sceneNodeMaps &&
  //       Object.values(this.sceneCollectionsService?.sceneNodeMaps).length === 0)
  //   ) {
  //     this.error = true;
  //     this.message = $t('The active scene collection is not a dual output scene collection.');
  //     return;
  //   }
  //   if (exportOverlay) {
  //     const { filePath } = await remote.dialog.showSaveDialog({
  //       filters: [{ name: 'Overlay File', extensions: ['overlay'] }],
  //     });
  //     if (!filePath) return;
  //     this.busy = true;

  //     // convert collection
  //     const collectionFilePath = await this.sceneCollectionsService.convertDualOutputCollection(
  //       assignToHorizontal,
  //     );

  //     if (!collectionFilePath) {
  //       this.error = true;
  //       this.message = $t('Unable to convert dual output collection.');
  //       return;
  //     }

  //     // save overlay
  //     this.overlaysPersistenceService.saveOverlay(filePath).then(() => {
  //       this.error = false;
  //       this.busy = false;
  //       this.message = $t('Successfully saved %{filename} to %{filepath}', {
  //         filename: path.parse(collectionFilePath).base,
  //         filepath: filePath,
  //       });
  //     });
  //   } else {
  //     this.busy = true;

  //     // convert collection
  //     const filePath = await this.sceneCollectionsService.convertDualOutputCollection(
  //       assignToHorizontal,
  //       this.collection,
  //     );

  //     if (filePath) {
  //       this.error = false;
  //       this.message = $t('Successfully converted %{filename}', {
  //         filename: path.parse(filePath).base,
  //       });
  //     } else {
  //       this.error = true;
  //       this.message = $t('Unable to convert dual output collection.');
  //     }
  //     this.busy = false;
  //   }
  // }

  // button(title: string, fn: () => void) {
  //   return (
  //     <button class="button button--action" disabled={this.busy} onClick={fn}>
  //       {title}
  //       {this.busy && <i class="fa fa-spinner fa-pulse" style={{ marginLeft: '5px' }} />}
  //     </button>
  //   );
  // }

  return (
    <>
      {/* <div class="section">
        {this.button($t('Create Scene Collection'), () => this.createSceneCollection())}
        {this.button($t('Import Widget File in Current Scene'), () => this.loadWidget())}
      </div>
      <div class="section">
        <p>
          {$t(
            'This feature is intended for overlay designers to export their work for our Overlay Library. Not all sources will be exported, use at your own risk.',
          )}
        </p>
        {this.button($t('Export Overlay File'), () => this.saveOverlay())}
        {this.button($t('Import Overlay File'), () => this.loadOverlay())}
        <BoolInput
          style="margin-top: 8px;"
          value={this.designerMode()}
          onInput={(v: boolean) => this.setDesignerMode(v)}
          title={$t('Enable Designer Mode')}
          name="designer_mode"
        />
        <br />
        {this.message}
      </div>
      <div class="section">
        <div class="section-content">
          <BoolInput
            vModel={this.mediaBackupOptOut}
            title={$t('Do not back up my media files in the cloud (requires app restart)')}
            name="media_backup_opt_out"
          />
        </div>
      </div>
      <div class="section">
        <h1>{$t('Manage Dual Output Scene')}</h1>

        <span>
          {$t(
            'The below will create a copy of the active scene collection, set the copy as the active collection, and then apply the function.',
          )}
        </span>
        <div>
          <h4 style="margin-bottom: 8px;">{$t('Convert to Vanilla Scene')}</h4>
          <VFormGroup
            value={this.collection}
            onInput={(value: string) => {
              this.collection = value;
            }}
            metadata={metadata.list({
              title: $t('Scene Collection'),
              name: 'collection',
              options: this.collectionOptions,
            })}
          />
          <button
            class="button button--soft-warning"
            onClick={async () => await this.convertDualOutputCollection()}
            disabled={this.busy}
          >
            {$t('Convert')}
          </button>
          {/* <button
              class="button button--soft-warning"
              onClick={async () => await this.convertDualOutputCollection(false, true)}
              disabled={this.busy}
            >
              {$t('Convert and Export Overlay')}
            </button> *}
        </div>
        {/* <div style={{ marginTop: '10px' }}>
            <h4>{$t('Assign Vertical Sources to Horizontal Display')}</h4>
            <button
              class="button button--soft-warning"
              onClick={async () => await this.convertDualOutputCollection(true)}
              disabled={this.busy}
            >
              {$t('Assign')}
            </button>
            <button
              class="button button--soft-warning"
              onClick={async () => await this.convertDualOutputCollection(true, true)}
              disabled={this.busy}
            >
              {$t('Assign and Export Overlay')}
            </button>
          </div> *}
        <div style={{ color: this.error ? 'red' : 'var(--teal)' }}>{this.message}</div>
      </div> */}
    </>
  );
}
