import { TObsValue } from 'components/obs/inputs/ObsInput';
import { ISourceFilter, SourceFiltersService, TSourceFilterType } from 'services/source-filters';
import { Inject } from '../../core/injector';
import { ArrayNode } from './array-node';

interface IContext {
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
    return this.sourceFiltersService.getFilters(context.sceneId);
  }

  saveItem(filter: ISourceFilter, context: IContext): Promise<ISourceFilterSchema> {
    return Promise.resolve(filter);
  }

  loadItem(filter: ISourceFilterSchema, context: IContext): Promise<void> {
    this.sourceFiltersService.add(context.sceneId, filter.type, filter.name, filter.settings);
    this.sourceFiltersService.setVisibility(context.sceneId, filter.name, filter.visible);
    return Promise.resolve();
  }
}
