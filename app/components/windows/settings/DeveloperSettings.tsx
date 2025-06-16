import Vue from 'vue';
import { Component } from 'vue-property-decorator';
import { Inject } from 'services/core/injector';
import GenericFormGroups from 'components/obs/inputs/GenericFormGroups.vue';
import { ITcpServerServiceApi, ITcpServersSettings } from 'services/api/tcp-server/index';
import { ISettingsSubCategory } from 'services/settings/index';
import AppPlatformDeveloperSettings from 'components/AppPlatformDeveloperSettings.vue';
import { PlatformAppsService } from 'services/platform-apps/index';
import { TextInput } from 'components/shared/inputs/inputs';
import VFormGroup from 'components/shared/inputs/VFormGroup.vue';
import { $t } from 'services/i18n/index';
import { SceneCollectionsService } from 'services/scene-collections';
import { OverlaysPersistenceService } from 'services/scene-collections/overlays';
import path from 'path';
import * as remote from '@electron/remote';

@Component({
  components: {
    GenericFormGroups,
    VFormGroup,
    TextInput,
    AppPlatformDeveloperSettings,
  },
})
export default class DeveloperSettings extends Vue {
  @Inject() tcpServerService: ITcpServerServiceApi;
  @Inject() platformAppsService: PlatformAppsService;
  @Inject() overlaysPersistenceService: OverlaysPersistenceService;
  @Inject() sceneCollectionsService: SceneCollectionsService;

  settingsFormData: ISettingsSubCategory[] = null;
  busy = false;
  message = '';
  error = false;

  created() {
    // Stop listening for security reasons
    this.tcpServerService.stopListening();
    this.settingsFormData = this.getApiSettingsFormData();
  }

  get tokenInput() {
    return this.tcpServerService.state.token;
  }

  generateToken() {
    this.tcpServerService.generateToken();
  }

  destroyed() {
    this.tcpServerService.listen();
  }

  get appDeveloperMode() {
    return this.platformAppsService.state.devMode;
  }

  restoreDefaults() {
    this.tcpServerService.setSettings(this.tcpServerService.getDefaultSettings());
    this.settingsFormData = this.getApiSettingsFormData();
  }

  /**
   * Convert a dual output scene collection to a vanilla scene collection
   * @param assignToHorizontal Boolean for if the vertical sources should be assigned to the
   * horizontal display or should be deleted
   * @param exportOverlay Boolean for is the scene collection should be exported upon completion
   */
  async convertDualOutputCollection(
    assignToHorizontal: boolean = false,
    exportOverlay: boolean = false,
  ) {
    // confirm that the active scene collection is a dual output collection
    if (
      !this.sceneCollectionsService?.sceneNodeMaps ||
      (this.sceneCollectionsService?.sceneNodeMaps &&
        Object.values(this.sceneCollectionsService?.sceneNodeMaps).length === 0)
    ) {
      this.error = true;
      this.message = $t('The active scene collection is not a dual output scene collection.');
      return;
    }
    if (exportOverlay) {
      const { filePath } = await remote.dialog.showSaveDialog({
        filters: [{ name: 'Overlay File', extensions: ['overlay'] }],
      });
      if (!filePath) return;
      this.busy = true;

      // convert collection
      const collectionFilePath = await this.sceneCollectionsService.convertDualOutputCollection(
        assignToHorizontal,
      );

      if (!collectionFilePath) {
        this.error = true;
        this.message = $t('Unable to convert dual output collection.');
        return;
      }

      // save overlay
      this.overlaysPersistenceService.saveOverlay(filePath).then(() => {
        this.error = false;
        this.busy = false;
        this.message = $t('Successfully saved %{filename} to %{filepath}', {
          filename: path.parse(collectionFilePath).base,
          filepath: filePath,
        });
      });
    } else {
      this.busy = true;

      // convert collection
      const filePath = await this.sceneCollectionsService.convertDualOutputCollection(
        assignToHorizontal,
      );

      if (filePath) {
        this.error = false;
        this.message = $t('Successfully converted %{filename}', {
          filename: path.parse(filePath).base,
        });
      } else {
        this.error = true;
        this.message = $t('Unable to convert dual output collection.');
      }
      this.busy = false;
    }
  }

  save(settingsData: ISettingsSubCategory[]) {
    const settings: Partial<ITcpServersSettings> = {};
    settingsData.forEach(subCategory => {
      subCategory.parameters.forEach(parameter => {
        // TODO: index
        // @ts-ignore
        if (!settings[subCategory.codeSubCategory]) settings[subCategory.codeSubCategory] = {};
        // TODO: index
        // @ts-ignore
        settings[subCategory.codeSubCategory][parameter.name] = parameter.value;
      });
    });
    this.tcpServerService.setSettings(settings);
    this.settingsFormData = this.getApiSettingsFormData();
  }

  private getApiSettingsFormData(): ISettingsSubCategory[] {
    return this.tcpServerService.getApiSettingsFormData();
  }

  render() {
    return (
      <div>
        {this.appDeveloperMode && (
          <div class="section">
            <AppPlatformDeveloperSettings />
          </div>
        )}

        <div class="section">
          <button class="button button--soft-warning" onClick={this.restoreDefaults}>
            {$t('Restore Defaults')}
          </button>
        </div>

        <div class="section">
          <h1>{$t('Manage Dual Output Scene')}</h1>

          <span>
            {$t(
              'The below will create a copy of the active scene collection, set the copy as the active collection, and then apply the function.',
            )}
          </span>
          <div>
            <h4>{$t('Convert to Vanilla Scene')}</h4>
            <button
              class="button button--soft-warning"
              onClick={async () => await this.convertDualOutputCollection()}
              disabled={this.busy}
            >
              {$t('Convert')}
            </button>
            <button
              class="button button--soft-warning"
              onClick={async () => await this.convertDualOutputCollection(false, true)}
              disabled={this.busy}
            >
              {$t('Convert and Export Overlay')}
            </button>
          </div>
          <div style={{ marginTop: '10px' }}>
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
          </div>
          <div style={{ color: this.error ? 'red' : 'var(--teal)' }}>{this.message}</div>
        </div>

        <div class="section">
          <div class="section-content">
            <VFormGroup metadata={{ title: $t('API Token') }}>
              <TextInput value={this.tokenInput} metadata={{ masked: true }}>
                <button class="button button--default" onClick={this.generateToken}>
                  {$t('Update')}
                </button>
              </TextInput>
            </VFormGroup>
          </div>
        </div>

        <GenericFormGroups value={this.settingsFormData} onInput={this.save} />
      </div>
    );
  }
}
