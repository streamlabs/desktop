import { Node } from './node';
import { HotkeysNode } from './hotkeys';
import {
  SourcesService,
  TSourceType,
  TPropertiesManager,
  macSources,
  windowsSources,
  EDeinterlaceMode,
  EDeinterlaceFieldOrder,
} from 'services/sources';
import { AudioService } from 'services/audio';
import { Inject } from '../../core/injector';
import * as obs from '../../../../obs-api';
import { ScenesService } from 'services/scenes';
import defaultTo from 'lodash/defaultTo';
import { byOS, OS } from 'util/operating-systems';
import { UsageStatisticsService } from 'services/usage-statistics';
import {
  EFilterDisplayType,
  SourceFiltersService,
  TSourceFilterType,
} from 'services/source-filters';

interface ISchema {
  items: ISourceInfo[];
}

interface IFilterInfo {
  name: string;
  type: TSourceFilterType;
  settings: obs.ISettings;
  enabled?: boolean;
  displayType?: EFilterDisplayType;
}

export interface ISourceInfo {
  id: string;
  name: string;
  type: TSourceType;
  settings: obs.ISettings;

  volume: number;
  forceMono?: boolean;
  syncOffset?: obs.ITimeSpec;
  audioMixers?: number;
  monitoringType?: obs.EMonitoringType;
  mixerHidden?: boolean;

  deinterlaceMode?: EDeinterlaceMode;
  deinterlaceFieldOrder?: EDeinterlaceFieldOrder;

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
  schemaVersion = 4;

  @Inject() private sourcesService: SourcesService;
  @Inject() private audioService: AudioService;
  @Inject() private scenesService: ScenesService;
  @Inject() private usageStatisticsService: UsageStatisticsService;
  @Inject() private sourceFiltersService: SourceFiltersService;

  getItems() {
    const linkedSourcesIds = this.scenesService.views
      .getSceneItems()
      .map(sceneItem => sceneItem.sourceId);

    return this.sourcesService.views.sources.filter(source => {
      // we store scenes in separated config
      if (source.type === 'scene') return false;

      // global audio sources must be saved
      if (source.channel) return true;

      // prevent sources without linked sceneItems to be saved
      return linkedSourcesIds.includes(source.sourceId);
    });
  }

  save(context: {}): Promise<void> {
    const promises: Promise<ISourceInfo>[] = this.getItems().map(source => {
      return new Promise(resolve => {
        const hotkeys = new HotkeysNode();

        return hotkeys.save({ sourceId: source.sourceId }).then(() => {
          const audioSource = this.audioService.views.getSource(source.sourceId);

          const obsInput = source.getObsInput();

          /* Signal to the source that it needs to save settings as
           * we're about to cache them to disk. */
          obsInput.save();

          const filters = this.sourceFiltersService.views
            .filtersBySourceId(source.sourceId, true)
            // For now, don't persist hidden filters as we don't have a use case
            .filter(f => f.displayType !== EFilterDisplayType.Hidden)
            .map(f => {
              const filterInput = this.sourceFiltersService.getObsFilter(source.sourceId, f.name);

              filterInput.save();

              return {
                name: f.name,
                type: f.type,
                settings: filterInput.settings,
                enabled: f.visible,
                displayType: f.displayType,
              };
            });

          let data: ISourceInfo = {
            hotkeys,
            id: source.sourceId,
            name: source.name,
            type: source.type,
            settings: obsInput.settings,
            volume: obsInput.volume,
            channel: source.channel,
            muted: source.muted,
            deinterlaceMode: source.deinterlaceMode,
            deinterlaceFieldOrder: source.deinterlaceFieldOrder,
            filters: {
              items: filters,
            },
            propertiesManager: source.getPropertiesManagerType(),
            propertiesManagerSettings: source.getPropertiesManagerSettings(),
          };

          // For now, don't save any settings for mediasoup
          if (source.type === 'mediasoupconnector') {
            data.settings = {};
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

          if (data.propertiesManager === 'replay') {
            // Don't save the last replay, otherwise it will just play an old
            // replay when this source is loaded back in.
            delete data.settings['local_file'];
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

  /**
   * Remove unsupported sources.
   */
  removeUnsupported(): boolean {
    const supportedSources = byOS({ [OS.Windows]: windowsSources, [OS.Mac]: macSources });
    const itemsCopy = this.data.items.slice();
    this.data.items = [];
    let removed = false;
    itemsCopy.forEach(source => {
      if (supportedSources.includes(source.type)) {
        this.data.items.push(source);
      } else {
        console.log(
          "Removed the source with id: '%s', name: '%s', and type: '%s' from the scene because it is not suppported",
          source.id,
          source.name,
          source.type,
        );
        removed = true;
      }
    });
    return removed;
  }

  load(context: {}): Promise<void> {
    this.sanitizeSources();

    const supportedSources = this.data.items.filter(source => {
      return byOS({
        [OS.Windows]: () => windowsSources.includes(source.type),
        [OS.Mac]: () => macSources.includes(source.type),
      });
    });

    const supportedPresets = this.sourceFiltersService.views.presetFilterOptions.map(
      opt => opt.value,
    );

    // In the `createSources` call to the backend, if an input is not created correctly
    // it will not be returned. This potentially means that the array returned by this
    // call will be a different length than the `supportedSources` and `sourceCreateData`
    // arrays. Because the array index is not a reliable unique identifier between, these
    // three arrays, create an object to reference the item data
    const sourceData = {};

    // This shit is complicated, IPC sucks
    const sourceCreateData = supportedSources.map(source => {
      // Universally disabled for security reasons
      if (source.settings.is_media_flag) {
        source.settings.is_media_flag = false;
      }

      const filters = source.filters.items
        .filter(filter => {
          if (filter.type === 'face_mask_filter') {
            return false;
          }

          // Work around an issue where we accidentaly had invalid filters
          // in scene collections.
          if (
            filter.name === '__PRESET' &&
            !supportedPresets.includes(
              this.sourceFiltersService.views.parsePresetValue(filter.settings.image_path),
            )
          ) {
            return false;
          }

          return true;
        })
        .map(filter => {
          if (filter.type === 'vst_filter') {
            this.usageStatisticsService.recordFeatureUsage('VST');
          }

          let displayType = filter.displayType;

          // Migrate scene collections that don't have displayType saved
          if (displayType == null) {
            if (filter.name === '__PRESET') {
              displayType = EFilterDisplayType.Preset;
            } else {
              displayType = EFilterDisplayType.Normal;
            }
          }

          return {
            name: filter.name,
            type: filter.type,
            settings: filter.settings,
            enabled: filter.enabled === void 0 ? true : filter.enabled,
            displayType,
          };
        });

      const sourceDataFilters = filters.map((f: IFilterInfo) => {
        return {
          name: f.name,
          type: f.type,
          visible: f.enabled,
          settings: f.settings,
          displayType: f.displayType,
        };
      });

      // add data to the reference object
      sourceData[source.id] = { ...source, filters: sourceDataFilters };

      return {
        name: source.id,
        type: source.type,
        muted: source.muted || false,
        settings: source.settings,
        volume: source.volume,
        syncOffset: source.syncOffset,
        deinterlaceMode: source.deinterlaceMode || EDeinterlaceMode.Disable,
        deinterlaceFieldOrder: source.deinterlaceFieldOrder || EDeinterlaceFieldOrder.Top,
        filters,
      };
    });

    // This ensures we have bound the source size callback
    // before creating any sources in OBS.
    this.sourcesService;

    const sources = obs.createSources(sourceCreateData);
    const promises: Promise<void>[] = [];
    let sourcesNotCreatedNames: string[] = [];

    if (sourceCreateData.length !== sources.length) {
      const sourcesNotCreated = sourceCreateData.filter(
        source => !sources.some(s => s.name === source.name),
      );

      sourcesNotCreatedNames = sourcesNotCreated.map(source => source.name);
      console.error(
        'Error during sources creation when loading scene collection.',
        JSON.stringify(sourcesNotCreatedNames.join(', ')),
      );

      this.sourcesService.missingInputs = sourcesNotCreated.map(
        source => this.sourcesService.sourceDisplayData[source.type]?.name,
      );
    }

    sources.forEach(async source => {
      const sourceInfo = sourceData[source.name];

      this.sourcesService.addSource(source, sourceInfo.name, {
        channel: sourceInfo.channel,
        propertiesManager: sourceInfo.propertiesManager,
        propertiesManagerSettings: sourceInfo.propertiesManagerSettings || {},
        deinterlaceMode: sourceInfo.deinterlaceMode,
        deinterlaceFieldOrder: sourceInfo.deinterlaceFieldOrder,
      });

      if (source.audioMixers) {
        this.audioService.views
          .getSource(sourceInfo.id)
          .setMul(sourceInfo.volume != null ? sourceInfo.volume : 1);

        const defaultMonitoring =
          (source.id as TSourceType) === 'browser_source'
            ? obs.EMonitoringType.MonitoringOnly
            : obs.EMonitoringType.None;

        this.audioService.views.getSource(sourceInfo.id).setSettings({
          forceMono: defaultTo(sourceInfo.forceMono, false),
          syncOffset: AudioService.timeSpecToMs(
            defaultTo(sourceInfo.syncOffset, { sec: 0, nsec: 0 }),
          ),
          audioMixers: defaultTo(sourceInfo.audioMixers, 255),
          monitoringType: defaultTo(sourceInfo.monitoringType, defaultMonitoring),
        });
        this.audioService.views.getSource(sourceInfo.id).setHidden(!!sourceInfo.mixerHidden);
      }

      if (sourceInfo.hotkeys) {
        if (sourcesNotCreatedNames.length > 0 && sourcesNotCreatedNames.includes(sourceInfo.id)) {
          console.error('Attempting to load hotkey for not created source:', sourceInfo.id);
        }

        promises.push(sourceInfo.hotkeys.load({ sourceId: sourceInfo.id }));
      }

      this.sourceFiltersService.loadFilterData(sourceInfo.id, sourceInfo.filters);
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
          // tslint:disable-next-line:prefer-template
          source.name = 'Desktop Audio' + (index > 1 ? ' ' + index : '');
          return;
        }

        const auxDeviceMatch = /^AuxAudioDevice(\d)$/.exec(source.name);
        if (auxDeviceMatch) {
          const index = parseInt(auxDeviceMatch[1], 10);
          // tslint:disable-next-line:prefer-template
          source.name = 'Mic/Aux' + (index > 1 ? ' ' + index : '');
          return;
        }
      });
    }

    // Migrate media sources to turn off HW decoding. This property previously
    // had no effect and now it does, so to make sure nothing changes, we are
    // reverting this flag to false for everyone.
    if (version < 4) {
      this.data.items.forEach(source => {
        if (source.type === 'ffmpeg_source') {
          source.settings.hw_decode = false;
        }
      });
    }
  }
}
