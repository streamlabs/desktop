import { Inject } from 'services/core/injector';
import {
  NVoiceCharacterService,
  NVoiceCharacterType,
  NVoiceCharacterTypes,
} from 'services/nvoice-character';
import { PropertiesManager } from './properties-manager';

export interface INVoiceCharacterSettings {
  nVoiceCharacterType: NVoiceCharacterType;
}

export class NVoiceCharacterManager extends PropertiesManager {
  @Inject() nVoiceCharacterService: NVoiceCharacterService;
  blacklist = [
    'url',
    'is_local_file',
    'fps_custom',
    'reroute_audio',
    'fps',
    'css',
    'shutdown',
    'restart_when_active',
    'refreshnocache',
  ];
  // displayOrder = [];

  settings: INVoiceCharacterSettings;

  applySettings(settings: Dictionary<any>) {
    this.settings.nVoiceCharacterType =
      (NVoiceCharacterTypes.includes(settings.nVoiceCharacterType) &&
        settings.nVoiceCharacterType) ||
      'near';
    this.setNVoiceCharacterType(this.settings.nVoiceCharacterType);
  }

  setNVoiceCharacterType(type: NVoiceCharacterType) {
    const url = this.nVoiceCharacterService.getUrl(type);

    if (this.obsSource.settings['url'] !== url) {
      this.obsSource.update({ url });
    }
  }
}
