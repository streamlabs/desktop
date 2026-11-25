import {
  Source as InternalSource,
  SourcesService as InternalSourcesService,
  TSourceType,
} from 'services/sources';
import { ServiceHelper, Inject } from 'services';
import { ISerializable } from '../../rpc-api';
import { TObsFormData } from 'services/sources/obs-properties';
import { Fallback, InjectFromExternalApi } from '../../external-api';
import { SourcesService } from './sources';
import Utils from '../../../utils';

/**
 * Serialized representation of a {@link Source}.
 */
export interface ISourceModel {
  sourceId: string;
  id: string; // Streamdeck uses id field
  name: string;
  type: TSourceType;
  audio: boolean;
  video: boolean;
  async: boolean;
  muted: boolean;
  width: number;
  height: number;
  doNotDuplicate: boolean;
  channel?: number;
  resourceId: string;
  configurable: boolean;
}

/**
 * API for single source management. Provides basic source operations like
 * renaming the source or updating settings and properties form data. For more
 * scene related operations see {@link SceneNode} and {@link Scene}.
 */
@ServiceHelper('SourcesService')
export class Source implements ISourceModel, ISerializable {
  @Inject('SourcesService') private internalSourcesService: InternalSourcesService;
  @Fallback() private source: InternalSource;
  @InjectFromExternalApi() private sourcesService: SourcesService;
  readonly id: string;
  readonly name: string;
  readonly type: TSourceType;
  readonly audio: boolean;
  readonly video: boolean;
  readonly async: boolean;
  readonly muted: boolean;
  readonly width: number;
  readonly height: number;
  readonly doNotDuplicate: boolean;
  readonly channel?: number;
  readonly resourceId: string;
  readonly configurable: boolean;

  constructor(public readonly sourceId: string) {
    this.source = this.internalSourcesService.views.getSource(sourceId);
    Utils.applyProxy(this, () => this.getModel());
  }

  private isDestroyed(): boolean {
    return this.source.isDestroyed();
  }

  /**
   * @returns The serialized representation of this {@link Source}.
   */
  getModel(): ISourceModel {
    return this.sourcesService.convertInternalModelToExternal(this.source.getModel());
  }

  /**
   * Updates the source's settings.
   *
   * @param settings The settings to update. Can be a partial representation.
   */
  updateSettings(settings: Dictionary<any>): void {
    this.source.updateSettings(settings);
  }

  /**
   * @returns The source's settings
   */
  getSettings(): Dictionary<any> {
    return this.source.getSettings();
  }

  /**
   * @returns The form data of the source's properties
   */
  getPropertiesFormData(): TObsFormData {
    return this.source.getPropertiesFormData();
  }

  /**
   * Sets the source's properties form data.
   *
   * @param properties The properties form data to set
   */
  setPropertiesFormData(properties: TObsFormData): void {
    return this.source.setPropertiesFormData(properties);
  }

  /**
   * Whether or not this source has properties.
   *
   * @returns `true` if this source has properties, `false` otherwise.
   */
  hasProps(): boolean {
    return this.source.hasProps();
  }

  /**
   * Renames this source.
   *
   * @param newName The new name to set for this source
   */
  setName(newName: string): void {
    return this.source.setName(newName);
  }

  /**
   * Refreshes the page of a browsers source. Only available for browser sources.
   */
  refresh(): void {
    this.source.refresh();
  }

  /**
   * Duplicates this source.
   *
   * @returns A duplication of this source
   */
  duplicate(): Source {
    return this.sourcesService.getSource(this.source.duplicate().sourceId);
  }
}
