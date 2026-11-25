import { ArrayNode } from './array-node';
import { Inject } from '../../core/injector';
import { ISourceFilter, SourceFiltersService, TSourceFilterType } from 'services/source-filters';
import { TObsValue } from 'components/obs/inputs/ObsInput';
import { ISceneCollectionLoadContext } from './load-session';

interface IContext extends ISceneCollectionLoadContext {
  sceneId: string;
}

export interface ISourceFilterSchema {
  name: string;
  type: TSourceFilterType;
  visible: boolean;
  settings: Dictionary<TObsValue>;
}

export class SceneFiltersNode extends ArrayNode<ISourceFilterSchema, IContext, ISourceFilter> {
  schemaVersion = 1;

  @Inject() private sourceFiltersService: SourceFiltersService;

  getItems(context: IContext): ISourceFilter[] {
    const filters = [...this.sourceFiltersService.getFilters(context.sceneId)];
    const preset = this.sourceFiltersService.views.presetFilterBySourceId(context.sceneId);

    if (preset) filters.push(preset);

    return filters;
  }

  saveItem(filter: ISourceFilter, context: IContext): Promise<ISourceFilterSchema> {
    return Promise.resolve(filter);
  }

  loadItem(filter: ISourceFilterSchema, context: IContext): Promise<void> {
    if (filter.type === 'face_mask_filter') return Promise.resolve();
    this.sourceFiltersService.add(context.sceneId, filter.type, filter.name, filter.settings);
    this.sourceFiltersService.setVisibility(context.sceneId, filter.name, filter.visible);
    return Promise.resolve();
  }
}
