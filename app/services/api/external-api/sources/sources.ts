import { IObsListOption } from 'services/sources/obs-properties';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  ISource as IInternalSourceModel,
  SourcesService as InternalSourcesService,
  TSourceType,
} from 'services/sources';
import { Inject } from 'services/core/injector';
import { Fallback, Singleton } from 'services/api/external-api';
import { ISourceModel, Source } from './source';

/**
 * Available source add options.
 */
export interface ISourceAddOptions {
  channel?: number;
  isTemporary?: boolean;
}

/**
 * API for sources management. Contains operations like source creation,
 * switching and deletion and provides observables for source events
 * registration.
 */
@Singleton()
export class SourcesService {
  @Fallback()
  @Inject()
  protected sourcesService: InternalSourcesService;

  createSource(
    name: string,
    type: TSourceType,
    settings?: Dictionary<any>,
    options?: ISourceAddOptions,
  ): Source {
    const source = this.sourcesService.createSource(name, type, settings, options);
    return this.getSource(source.sourceId);
  }

  /**
   * Returns the source with the provided id.
   *
   * @param sourceId The id of the source to get
   */
  getSource(sourceId: string): Source | null {
    const source = this.sourcesService.views.getSource(sourceId);
    return source ? new Source(sourceId) : null;
  }

  /**
   * @returns The list of all created sources.
   */
  getSources(): Source[] {
    return this.sourcesService.views.getSources().map(source => this.getSource(source.sourceId));
  }

  /**
   * Removes a source by id.
   *
   * @param id The id of the source to remove
   */
  removeSource(id: string): void {
    this.sourcesService.removeSource(id);
  }

  /**
   * Provides a list of all available source types.
   *
   * @returns A list with the available source types.
   * @see TSourceType
   */
  getAvailableSourcesTypesList(): IObsListOption<TSourceType>[] {
    return this.sourcesService.getAvailableSourcesTypesList();
  }

  /**
   * Returns a list of sources found by a specific name.
   *
   * @param name The name of the sources to get
   * @returns A list of sources with matching name
   */
  getSourcesByName(name: string): Source[] {
    return this.sourcesService.views
      .getSourcesByName(name)
      .map(source => this.getSource(source.sourceId));
  }

  /**
   * Creates a source from a file. The source type depends on the file
   * extension.
   *
   * @param path The path to the file
   * @returns The source created from the file
   */
  addFile(path: string): Source | null {
    return this.getSource(this.sourcesService.addFile(path).sourceId);
  }

  /**
   * Opens the source's properties.
   *
   * @param sourceId
   */
  showSourceProperties(sourceId: string): void {
    return this.sourcesService.showSourceProperties(sourceId);
  }

  /**
   * Opens the sources showcase (dialog for creating new sources).
   */
  showShowcase(): void {
    return this.sourcesService.showShowcase();
  }

  /**
   * opens the sources showcase with preselected source type.
   *
   * @param sourceType The source type to use a preselection
   * @see showShowcase
   */
  showAddSource(sourceType: TSourceType): void {
    return this.sourcesService.showAddSource(sourceType);
  }

  /**
   * Observable event that is triggered whenever a new source is added. The
   * observed value is the newly added source serialized as {@link ISourceModel}.
   */
  get sourceAdded(): Observable<ISourceModel> {
    return this.exposeSourceEvent(this.sourcesService.sourceAdded);
  }

  /**
   * Observable event that is triggered whenever a source is updated. The
   * observed value is the updated source serialized as {@link ISourceModel}.
   */
  get sourceUpdated(): Observable<ISourceModel> {
    return this.exposeSourceEvent(this.sourcesService.sourceUpdated);
  }

  /**
   * Observable event that is triggered whenever a source is removed. The
   * observed value is the removed source serialized as {@link ISourceModel}.
   */
  get sourceRemoved(): Observable<ISourceModel> {
    return this.exposeSourceEvent(this.sourcesService.sourceRemoved);
  }

  /**
   * Converts an InternalApi event to ExternalApi event.
   */
  private exposeSourceEvent(
    observable: Observable<IInternalSourceModel>,
  ): Observable<ISourceModel> {
    return observable.pipe(
      map(internalSourceModel => this.convertInternalModelToExternal(internalSourceModel)),
    );
  }

  /**
   * Convertes an internal source model to an external / serialized source model.
   *
   * @param internalModel The internal source model to serialized
   * @returns The internal model serialized as external model
   */
  convertInternalModelToExternal(internalModel: IInternalSourceModel): ISourceModel {
    return {
      sourceId: internalModel.sourceId,
      id: internalModel.sourceId,
      name: internalModel.name,
      type: internalModel.type,
      audio: internalModel.audio,
      video: internalModel.video,
      async: internalModel.async,
      muted: internalModel.muted,
      width: internalModel.width,
      height: internalModel.height,
      doNotDuplicate: internalModel.doNotDuplicate,
      channel: internalModel.channel,
      configurable: internalModel.configurable,
      resourceId: `Source["${internalModel.sourceId}"]`,
    };
  }
}
