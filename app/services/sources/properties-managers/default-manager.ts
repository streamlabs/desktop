import { IObsListInput, TObsFormData, TObsValue } from 'components/obs/inputs/ObsInput';
import fs from 'fs';
import * as fi from 'node-fontinfo';
import { EFontStyle } from 'obs-studio-node';
import path from 'path';
import { Inject } from 'services/core/injector';
import { CustomizationService } from 'services/customization';
import { FontLibraryService } from 'services/font-library';
import { UserService } from 'services/user';
import { PropertiesManager } from './properties-manager';

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
  @Inject() fontLibraryService: FontLibraryService;
  @Inject() userService: UserService;
  @Inject() customizationService: CustomizationService;

  settings: IDefaultManagerSettings;

  mediaBackupFileSetting: string;
  currentMediaPath: string;

  init() {
    if (!this.settings.mediaBackup) this.settings.mediaBackup = {};
    this.downloadGoogleFont();

    if (this.obsSource.id === 'slideshow') {
      this.blacklist = ['slide_mode'];
    }
  }

  setPropertiesFormData(properties: TObsFormData) {
    super.setPropertiesFormData(properties);
    if (this.obsSource.settings[this.mediaBackupFileSetting] !== this.currentMediaPath) {
      this.currentMediaPath = this.obsSource.settings[this.mediaBackupFileSetting];
    }
  }

  getPropertiesFormData(): TObsFormData {
    const propArray = super.getPropertiesFormData();

    // TODO: 選択肢単位のフィルタリング機構がないので暫定対処、これ以上増やしたくなったらやり方を考えること
    // TODO: ホットキーのフォームが未実装
    if (this.obsSource.id === 'game_capture') {
      const captureModeProp = propArray.find(
        prop => prop.name === 'capture_mode',
      ) as IObsListInput<TObsValue>;
      if (captureModeProp) {
        captureModeProp.options = captureModeProp.options.filter(option => {
          return option.value !== 'hotkey';
        });
      }
    }

    return propArray;
  }

  async downloadGoogleFont() {
    if (this.obsSource.id !== 'text_gdiplus') return;

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
}
