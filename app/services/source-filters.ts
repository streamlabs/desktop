import * as Sentry from '@sentry/vue';
import {
  IObsListInput,
  IObsListOption,
  TObsFormData,
  TObsValue,
  getPropertiesFormData,
  setPropertiesFormData,
} from 'components/obs/inputs/ObsInput';
import { Service } from './core/service';

import { EOrderMovement } from 'obs-studio-node';
import { $t } from 'services/i18n';
import * as obs from '../../obs-api';
import namingHelpers from '../util/NamingHelpers';
import { InitAfter } from './core';
import { Inject } from './core/injector';
import { SourcesService } from './sources';
import { WindowsService } from './windows';

export type TSourceFilterType =
  | 'mask_filter'
  | 'crop_filter'
  | 'gain_filter'
  | 'color_filter'
  | 'scale_filter'
  | 'scroll_filter'
  | 'gpu_delay'
  | 'color_key_filter'
  | 'clut_filter'
  | 'sharpness_filter'
  | 'chroma_key_filter'
  | 'async_delay_filter'
  | 'noise_suppress_filter'
  | 'noise_gate_filter'
  | 'compressor_filter'
  | 'vst_filter';

interface ISourceFilterType {
  type: TSourceFilterType;
  description: string;
  video: boolean;
  audio: boolean;
  async: boolean;
}

export interface ISourceFilter {
  name: string;
  type: TSourceFilterType;
  visible: boolean;
  settings: Dictionary<TObsValue>;
}
@InitAfter('SourcesService')
export class SourceFiltersService extends Service {
  @Inject()
  sourcesService: SourcesService;

  @Inject()
  windowsService: WindowsService;

  getTypesList(): IObsListOption<TSourceFilterType>[] {
    const obsAvailableTypes = obs.FilterFactory.types();
    const whitelistedTypes: IObsListOption<TSourceFilterType>[] = [
      { description: $t('filters.mask'), value: 'mask_filter' },
      { description: $t('filters.crop'), value: 'crop_filter' },
      { description: $t('filters.gain'), value: 'gain_filter' },
      { description: $t('filters.color'), value: 'color_filter' },
      { description: $t('filters.scale'), value: 'scale_filter' },
      { description: $t('filters.scroll'), value: 'scroll_filter' },
      { description: $t('filters.renderDelay'), value: 'gpu_delay' },
      { description: $t('filters.colorKey'), value: 'color_key_filter' },
      { description: $t('filters.applyLut'), value: 'clut_filter' },
      { description: $t('filters.sharpen'), value: 'sharpness_filter' },
      { description: $t('filters.chromaKey'), value: 'chroma_key_filter' },
      { description: $t('filters.asyncDelay'), value: 'async_delay_filter' },
      { description: $t('filters.noiseSuppression'), value: 'noise_suppress_filter' },
      { description: $t('filters.noiseGate'), value: 'noise_gate_filter' },
      { description: $t('filters.compressor'), value: 'compressor_filter' },
      { description: $t('filters.vst'), value: 'vst_filter' },
    ];

    return whitelistedTypes.filter(type => obsAvailableTypes.includes(type.value));
  }

  getTypes(): ISourceFilterType[] {
    const typesList = this.getTypesList();
    const types: ISourceFilterType[] = [];

    obs.FilterFactory.types().forEach(type => {
      const listItem = typesList.find(item => item.value === type);
      if (!listItem) {
        console.warn(`filter ${type} is not found in available types`);
        return;
      }
      const description = listItem.description;
      const flags = obs.Global.getOutputFlagsFromId(type);
      types.push({
        audio: !!(obs.ESourceOutputFlags.Audio & flags),
        video: !!(obs.ESourceOutputFlags.Video & flags),
        async: !!(obs.ESourceOutputFlags.Async & flags),
        type: listItem.value,
        description,
      });
    });

    return types;
  }

  getTypesForSource(sourceId: string): ISourceFilterType[] {
    const source = this.sourcesService.getSource(sourceId);
    return this.getTypes().filter(filterType => {
      /* Audio filters can be applied to audio sources. */
      if (source.audio && filterType.audio) {
        return true;
      }

      /* We have either a video filter or source */
      /* Can't apply asynchronous video filters to non-asynchronous video souces. */
      if (!source.async && filterType.async) {
        return false;
      }

      /* Video filters can be applied to video sources. */
      if (source.video && filterType.video) {
        return true;
      }

      return false;
    });
  }

  add(
    sourceId: string,
    filterType: TSourceFilterType,
    filterName: string,
    settings?: Dictionary<TObsValue>,
  ) {
    const source = this.sourcesService.getSource(sourceId);
    const obsFilter = obs.FilterFactory.create(filterType, filterName, settings || {});

    const obsSource = source.getObsInput();
    obsSource.addFilter(obsFilter);
    // The filter should be created with the settings provided, is this necessary?
    if (settings) obsFilter.update(settings);
    const filterReference = obsSource.findFilter(filterName);
    // There is now 2 references to the filter at that point
    // We need to release one
    obsFilter.release();
    return filterReference;
  }

  copyFilters(fromSourceId: string, toSourceId: string) {
    this.getFilters(fromSourceId).forEach(filter => {
      this.add(toSourceId, filter.type, this.suggestName(toSourceId, filter.name), filter.settings);
    });
  }

  suggestName(sourceId: string, filterName: string): string {
    return namingHelpers.suggestName(filterName, (name: string) =>
      this.getObsFilter(sourceId, name),
    );
  }

  remove(sourceId: string, filterName: string) {
    const obsFilter = this.getObsFilter(sourceId, filterName);
    const source = this.sourcesService.getSource(sourceId);
    source.getObsInput().removeFilter(obsFilter);
  }

  setPropertiesFormData(sourceId: string, filterName: string, properties: TObsFormData) {
    if (!filterName) return;
    setPropertiesFormData(this.getObsFilter(sourceId, filterName), properties);
  }

  getFilters(sourceId: string): ISourceFilter[] {
    return (
      this.sourcesService
        .getSource(sourceId)
        ?.getObsInput()
        .filters.map(obsFilter => ({
          visible: obsFilter.enabled,
          name: obsFilter.name,
          type: obsFilter.id as TSourceFilterType,
          settings: obsFilter.settings,
        })) || []
    );
  }

  setVisibility(sourceId: string, filterName: string, visible: boolean) {
    this.getObsFilter(sourceId, filterName).enabled = visible;
  }

  getAddNewFormData(sourceId: string) {
    const availableTypesList = this.getTypesForSource(sourceId).map(filterType => {
      return { description: filterType.description, value: filterType.type };
    });

    return {
      type: {
        description: $t('filters.filterType'),
        name: 'type',
        value: availableTypesList[0].value,
        options: availableTypesList,
      },
      name: {
        description: $t('filters.filterName'),
        name: 'name',
        value: 'New filter',
      },
    };
  }

  getPropertiesFormData(sourceId: string, filterName: string): TObsFormData {
    if (!filterName) return [];
    const filter = this.getObsFilter(sourceId, filterName);
    if (!filter) {
      Sentry.withScope(scope => {
        scope.setLevel('error');
        scope.setExtra('sourceId', sourceId);
        scope.setExtra('filterName', filterName);
        Sentry.captureException(new Error('Filter not found'));
      });
      return [];
    }
    const formData = getPropertiesFormData(filter);

    // サイドチェーンのトリガーにする音声ソースがIDしかもらえないので、名前に変換する
    formData?.forEach((input: any) => {
      if (input.name === 'sidechain_source') {
        (input as IObsListInput<string>).options.forEach(option => {
          if (option.value === 'none') return;

          const source = this.sourcesService.getSourceById(option.value);
          if (source) option.description = source.name;
        });
      }
    });

    return formData;
  }

  setOrder(sourceId: string, filterName: string, delta: number) {
    const obsFilter = this.getObsFilter(sourceId, filterName);
    const obsInput = this.sourcesService.getSource(sourceId).getObsInput();
    const movement = delta > 0 ? EOrderMovement.Down : EOrderMovement.Up;
    let i = Math.abs(delta);
    while (i--) {
      obsInput.setFilterOrder(obsFilter, movement);
    }
  }

  showSourceFilters(sourceId: string, selectedFilterName = '') {
    const sourceDisplayName = this.sourcesService.getSource(sourceId).name;
    this.windowsService.showWindow({
      componentName: 'SourceFilters',
      title: $t('sources.layerFilters') + ' (' + sourceDisplayName + ')',
      queryParams: { sourceId, selectedFilterName },
      size: {
        width: 800,
        height: 800,
      },
    });
  }

  showAddSourceFilter(sourceId: string) {
    this.windowsService.showWindow({
      componentName: 'AddSourceFilter',
      title: $t('sources.addLayerFilter'),
      queryParams: { sourceId },
      size: {
        width: 600,
        height: 400,
      },
    });
  }

  private getObsFilter(sourceId: string, filterName: string): obs.IFilter {
    return this.sourcesService.getSource(sourceId).getObsInput().findFilter(filterName);
  }
}
