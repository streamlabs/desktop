import { PropertiesManager } from './properties-manager';
import { Inject } from 'services/core/injector';
import { MediaBackupService } from 'services/media-backup';
import * as fi from 'node-fontinfo';
import { FontLibraryService } from 'services/font-library';
import { EFontStyle } from 'obs-studio-node';
import fs from 'fs';
import path from 'path';
import { UserService } from 'services/user';
import { CustomizationService } from 'services/customization';
import { TObsValue } from 'components/obs/inputs/ObsInput';
import electron from 'electron';
import { $t } from 'services/i18n';
import { getSharedResource } from 'util/get-shared-resource';
import * as remote from '@electron/remote';

export interface IDefaultManagerSettings {
  mediaBackup?: {
    localId?: string;
    serverId?: number;
    originalPath?: string;
  };
}

/**
 * This properties manager simply exposes all properties
 * and does not modify them.
 */
export class DefaultManager extends PropertiesManager {
  @Inject() mediaBackupService: MediaBackupService;
  @Inject() fontLibraryService: FontLibraryService;
  @Inject() userService: UserService;
  @Inject() customizationService: CustomizationService;

  settings: IDefaultManagerSettings;

  mediaBackupFileSetting: string;
  currentMediaPath: string;

  init() {
    if (!this.settings.mediaBackup) this.applySettings({ mediaBackup: {} });
    this.initializeMediaBackup();
    this.downloadGoogleFont();
    this.setupAutomaticGameCapture();
  }

  handleSettingsChange(settings: Dictionary<TObsValue>) {
    if (this.obsSource.settings[this.mediaBackupFileSetting] !== this.currentMediaPath) {
      this.currentMediaPath = this.obsSource.settings[this.mediaBackupFileSetting];
      this.uploadNewMediaFile();
    }
  }

  private initializeMediaBackup() {
    if (this.customizationService.state.mediaBackupOptOut) {
      this.applySettings({ mediaBackup: {} });
      return;
    }

    if (!this.userService.isLoggedIn) return;

    if (this.obsSource.id === 'ffmpeg_source') {
      this.mediaBackupFileSetting = 'local_file';
    } else if (this.obsSource.id === 'image_source') {
      this.mediaBackupFileSetting = 'file';
    } else if (this.obsSource.id === 'obs_stinger_transition') {
      this.mediaBackupFileSetting = 'path';
    } else if (this.obsSource.id === 'game_capture') {
      this.mediaBackupFileSetting = 'user_placeholder_image';
    } else {
      return;
    }

    this.ensureMediaBackupId();
    this.currentMediaPath = this.obsSource.settings[this.mediaBackupFileSetting];

    if (this.settings.mediaBackup.serverId && this.settings.mediaBackup.originalPath) {
      this.mediaBackupService
        .syncFile(
          this.settings.mediaBackup.localId,
          this.settings.mediaBackup.serverId,
          this.settings.mediaBackup.originalPath,
        )
        .then(file => {
          if (file && !this.destroyed) {
            this.currentMediaPath = file.filePath;
            this.obsSource.update({ [this.mediaBackupFileSetting]: file.filePath });
          }
        });
    } else {
      this.uploadNewMediaFile();
    }
  }

  private uploadNewMediaFile() {
    if (!this.mediaBackupFileSetting) return;
    if (!this.obsSource.settings[this.mediaBackupFileSetting]) return;

    this.applySettings({
      mediaBackup: { ...this.settings.mediaBackup, serverId: null, originalPath: null },
    });

    this.mediaBackupService
      .createNewFile(
        this.settings.mediaBackup.localId,
        this.obsSource.settings[this.mediaBackupFileSetting],
      )
      .then(file => {
        if (file) {
          this.applySettings({
            mediaBackup: {
              localId: file.id,
              serverId: file.serverId,
              originalPath: this.obsSource.settings[this.mediaBackupFileSetting],
            },
          });
        }
      });
  }

  private ensureMediaBackupId() {
    if (this.settings.mediaBackup.localId) return;
    this.applySettings({
      mediaBackup: {
        ...this.settings.mediaBackup,
        localId: this.mediaBackupService.getLocalFileId(),
      },
    });
  }

  isMediaBackupSource() {
    return this.obsSource.id === 'ffmpeg_source';
  }

  private async downloadGoogleFont() {
    if (!['text_gdiplus', 'text_ft2_source'].includes(this.obsSource.id)) return;

    const settings = this.obsSource.settings;
    const newSettings: Dictionary<any> = {};

    if (!settings['custom_font']) return;
    if (fs.existsSync(settings.custom_font)) return;

    const filename = path.parse(settings['custom_font']).base;

    const fontPath = await this.fontLibraryService.downloadFont(filename);

    // Make sure this wasn't destroyed while fetching the font
    if (this.destroyed) return;

    const fontInfo = fi.getFontInfo(fontPath);

    if (!fontInfo) {
      // Fallback to Arial
      newSettings['custom_font'] = null;
      newSettings['font'] = {
        face: 'Arial',
        flags: 0,
      };
      this.obsSource.update(newSettings);
      return;
    }

    newSettings['custom_font'] = fontPath;
    newSettings['font'] = { ...settings['font'] };
    newSettings['font'] = newSettings['font'] || {};
    newSettings['font']['face'] = fontInfo.family_name;
    newSettings['font']['flags'] =
      (fontInfo.italic ? EFontStyle.Italic : 0) | (fontInfo.bold ? EFontStyle.Bold : 0);

    this.obsSource.update(newSettings);
  }

  private setupAutomaticGameCapture() {
    if (!['game_capture', 'screen_capture'].includes(this.obsSource.id)) return;

    this.obsSource.update({
      auto_capture_rules_path: path.join(remote.app.getPath('userData'), 'game_capture_list.json'),
      auto_placeholder_image: getSharedResource('capture-placeholder.png'),
      auto_placeholder_message: $t('Looking for a game to capture'),
      window_placeholder_image: getSharedResource('capture-placeholder.png'),
      window_placeholder_waiting_message: $t('Looking for a game to capture'),
      window_placeholder_missing_message: $t('Specified window is not a game'),
      capture_overlays: this.obsSource.settings.capture_overlays ?? true,
    });
  }
}
