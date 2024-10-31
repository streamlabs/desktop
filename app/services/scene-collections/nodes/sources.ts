import * as fi from 'node-fontinfo';
import { AudioService } from 'services/audio';
import { FontLibraryService } from 'services/font-library';
import { $t } from 'services/i18n';
import { ScenesService } from 'services/scenes';
import {
  SourcesService,
  TPropertiesManager,
  TSourceType,
  isNoAudioPropertiesManagerType,
} from 'services/sources';
import * as obs from '../../../../obs-api';
import { Inject } from '../../core/injector';
import { HotkeysNode } from './hotkeys';
import { Node } from './node';
import { applyPathConvertForPreset, unapplyPathConvertForPreset } from './sources-util';

interface ISchema {
  items: ISourceInfo[];
}

interface IFilterInfo {
  name: string;
  type: string;
  settings: obs.ISettings;
  enabled?: boolean;
}

export interface ISourceInfo {
  id: string;
  name: string;
  type: TSourceType;
  settings: obs.ISettings;

  volume: number;
  forceMono?: boolean;
  syncOffset?: obs.ITimeSpec;
  deinterlaceMode?: obs.EDeinterlaceMode;
  deinterlaceFieldOrder?: obs.EDeinterlaceFieldOrder;

  audioMixers?: number;
  monitoringType?: obs.EMonitoringType;
  mixerHidden?: boolean;

  filters: {
    items: IFilterInfo[];
  };
  hotkeys?: HotkeysNode;
  channel?: number;
  muted?: boolean;

  propertiesManager?: TPropertiesManager;
  propertiesManagerSettings?: Dictionary<any>;
}

export class SourcesNode extends Node<ISchema, {}> {
  schemaVersion = 3;

  @Inject() private fontLibraryService: FontLibraryService;
  @Inject() private sourcesService: SourcesService;
  @Inject() private audioService: AudioService;
  @Inject() private scenesService: ScenesService;

  getItems() {
    const linkedSourcesIds = this.scenesService
      .getSceneItems()
      .map(sceneItem => sceneItem.sourceId);

    return this.sourcesService.sources.filter(source => {
      // we store scenes in separated config
      if (source.type === 'scene') return false;

      // global audio sources must be saved
      if (source.channel) return true;

      // prevent sources without linked sceneItems to be saved
      if (!linkedSourcesIds.includes(source.sourceId)) return false;
      return true;
    });
  }

  save(context: {}): Promise<void> {
    const promises: Promise<ISourceInfo>[] = this.getItems().map(source => {
      return new Promise(resolve => {
        const hotkeys = new HotkeysNode();

        hotkeys.save({ sourceId: source.sourceId }).then(() => {
          const audioSource = this.audioService.getSource(source.sourceId);

          const obsInput = source.getObsInput();
          if (!obsInput) {
            throw Error(`source '${source.sourceId}': getObsInput() not found`);
          }

          /* Signal to the source that it needs to save settings as
           * we're about to cache them to disk. */
          obsInput.save();

          let data: ISourceInfo = {
            id: source.sourceId,
            name: source.name,
            type: source.type,
            settings: unapplyPathConvertForPreset(source.type, obsInput.settings),
            volume: obsInput.volume,
            channel: source.channel,
            hotkeys,
            muted: obsInput.muted,
            filters: {
              items: obsInput.filters.map(filter => {
                /* Remember that filters are also sources.
                 * We should eventually do this for transitions
                 * as well. Scenes can be ignored. */
                filter.save();

                return {
                  name: filter.name,
                  type: filter.id,
                  settings: filter.settings,
                  enabled: filter.enabled,
                };
              }),
            },
            propertiesManager: source.getPropertiesManagerType(),
            propertiesManagerSettings: source.getPropertiesManagerSettings(),
          };

          if (source.video && source.async) {
            data = {
              ...data,
              deinterlaceMode: source.deinterlaceMode,
              deinterlaceFieldOrder: source.deinterlaceFieldOrder,
            };
          }

          if (audioSource) {
            data = {
              ...data,
              forceMono: audioSource.forceMono,
              syncOffset: AudioService.msToTimeSpec(audioSource.syncOffset),
              audioMixers: audioSource.audioMixers,
              monitoringType: audioSource.monitoringType,
              mixerHidden: audioSource.mixerHidden,
            };
          }

          resolve(data);
        });
      });
    });

    return new Promise(resolve => {
      Promise.all(promises).then(items => {
        this.data = { items };
        resolve();
      });
    });
  }

  checkTextSourceValidity(item: ISourceInfo) {
    if (item.type !== 'text_gdiplus') {
      return;
    }

    const settings = item.settings;

    if (settings['font']['face'] && settings['font']['flags'] != null) {
      return;
    }

    /* Defaults */
    settings['font']['face'] = 'Arial';
    settings['font']['flags'] = 0;

    /* This should never happen */
    if (!settings.custom_font) {
      const source = this.sourcesService.getSource(item.id);
      source.updateSettings({ font: settings.font });
      return;
    }

    const fontInfo = fi.getFontInfo(settings.custom_font);

    if (!fontInfo) {
      const source = this.sourcesService.getSource(item.id);
      source.updateSettings({ font: settings.font });
      return;
    }

    settings['font']['face'] = fontInfo.family_name;

    settings['font']['flags'] =
      (fontInfo.italic ? obs.EFontStyle.Italic : 0) | (fontInfo.bold ? obs.EFontStyle.Bold : 0);

    const source = this.sourcesService.getSource(item.id);
    source.updateSettings({ font: settings.font });
  }

  /**
   * Do some data sanitizing
   */
  sanitizeSources() {
    // Look for duplicate ids and channels
    const ids: Set<string> = new Set();
    const channels: Set<number> = new Set();

    this.data.items = this.data.items.filter(item => {
      if (ids.has(item.id)) return false;
      ids.add(item.id);

      if (item.channel != null) {
        if (channels.has(item.channel)) return false;
        channels.add(item.channel);
      }

      return true;
    });
  }

  load(context: {}): Promise<void> {
    this.sanitizeSources();

    // This shit is complicated, IPC sucks
    const sourceCreateData = this.data.items.map(source => {
      return {
        name: source.id,
        type: source.type,
        muted: source.muted || false,
        settings: applyPathConvertForPreset(source.type, source.settings),
        volume: source.volume,
        filters: source.filters.items.map(filter => {
          return {
            name: filter.name,
            type: filter.type,
            settings: filter.settings,
            enabled: filter.enabled === void 0 ? true : filter.enabled,
          };
        }),
        syncOffset: { sec: 0, nsec: 0 },
        deinterlaceMode: source.deinterlaceMode || obs.EDeinterlaceMode.Disable,
        deinterlaceFieldOrder: source.deinterlaceFieldOrder || obs.EDeinterlaceFieldOrder.Top,
      };
    });

    // This ensures we have bound the source size callback
    // before creating any sources in OBS.
    this.sourcesService;

    const sources = obs.createSources(sourceCreateData);
    const promises: Promise<void>[] = [];

    sources.forEach((source, index) => {
      const sourceInfo = this.data.items[index];

      this.sourcesService.addSource(source, this.data.items[index].name, {
        channel: sourceInfo.channel,
        propertiesManager: sourceInfo.propertiesManager,
        propertiesManagerSettings: sourceInfo.propertiesManagerSettings || {},
      });

      const newSource = this.sourcesService.getSource(sourceInfo.id);
      if (newSource.async && newSource.video) {
        if (sourceInfo.deinterlaceMode !== void 0) {
          newSource.setDeinterlaceMode(sourceInfo.deinterlaceMode);
        }
        if (sourceInfo.deinterlaceFieldOrder !== void 0) {
          newSource.setDeinterlaceFieldOrder(sourceInfo.deinterlaceFieldOrder);
        }
      }

      const useAudio = !isNoAudioPropertiesManagerType(sourceInfo.propertiesManager);

      if (useAudio && source.audioMixers) {
        this.audioService
          .getSource(sourceInfo.id)
          .setMul(sourceInfo.volume != null ? sourceInfo.volume : 1);
        this.audioService.getSource(sourceInfo.id).setSettings({
          forceMono: sourceInfo.forceMono,
          syncOffset: sourceInfo.syncOffset ? AudioService.timeSpecToMs(sourceInfo.syncOffset) : 0,
          audioMixers: sourceInfo.audioMixers,
          monitoringType: sourceInfo.monitoringType,
        });
        this.audioService.getSource(sourceInfo.id).setHidden(!!sourceInfo.mixerHidden);
      }

      if (sourceInfo.hotkeys) {
        promises.push(this.data.items[index].hotkeys.load({ sourceId: sourceInfo.id }));
      }
    });

    return new Promise(resolve => {
      Promise.all(promises).then(() => resolve());
    });
  }

  migrate(version: number) {
    // migrate audio sources names
    if (version < 3) {
      this.data.items.forEach(source => {
        const desktopDeviceMatch = /^DesktopAudioDevice(\d)$/.exec(source.name);
        if (desktopDeviceMatch) {
          const index = parseInt(desktopDeviceMatch[1], 10);
          source.name = $t('sources.desktopAudio') + (index > 1 ? ' ' + index : '');
          return;
        }

        const auxDeviceMatch = /^AuxAudioDevice(\d)$/.exec(source.name);
        if (auxDeviceMatch) {
          const index = parseInt(auxDeviceMatch[1], 10);
          source.name = $t('sources.micAux') + (index > 1 ? ' ' + index : '');
          return;
        }
      });
    }
  }
}
