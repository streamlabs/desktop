import { SceneCollectionsService as InternalSceneCollectionsService } from 'services/scene-collections';
import { Inject } from 'services/core/injector';
import { Fallback, Singleton } from 'services/api/external-api';
import { Observable } from 'rxjs';
import { Expensive } from 'services/api/external-api-limits';

/**
 * Representation of a scene collection.
 */
interface ISceneCollectionsManifestEntry {
  id: string;
  name: string;
}

/**
 * Available options for creating a new scene collection. The only information
 * currently required is the scene collection's name.
 */
interface ISceneCollectionCreateOptions {
  name?: string;
}

/**
 * Detailed representation of a scene collection. Generating this detailed schema
 * is expensive and should be avoided.
 *
 * @see {@link SceneCollectionsService.fetchSceneCollectionsSchema}
 */
interface ISceneCollectionSchema {
  name: string;
  id: string;

  scenes: {
    id: string;
    name: string;
    sceneItems: { sceneItemId: string; sourceId: string }[];
  }[];

  sources: {
    sourceId: string;
    name: string;
    type: string;
    channel: number;
  }[];
}

/**
 * API for scene collections management. Provides operations for creating,
 * changing and deleting scene collections. Also provides observables for
 * listening on scene collection changes and accessors for scene collection
 * detailed information.
 */
@Singleton()
export class SceneCollectionsService {
  @Fallback()
  @Inject()
  protected sceneCollectionsService: InternalSceneCollectionsService;

  /**
   * The currently active scene collection.
   */
  get activeCollection(): ISceneCollectionsManifestEntry {
    const collection = this.sceneCollectionsService.activeCollection;
    return {
      id: collection.id,
      name: collection.name,
    };
  }

  /**
   * Gets whether or not this is a new user's first login. This is set
   * on load when the app attempts to sync scene collections with the
   * cloud for the first time and signifies that no scene collections
   * were found.
   */
  get newUserFirstLogin(): boolean {
    return this.sceneCollectionsService.newUserFirstLogin;
  }

  /**
   * Provides the scene collection's schema including all scenes, scene nodes
   * and sources. This operation is expensive and should be avoided if possible.
   *
   * @returns The currently active scene collection's schema
   */
  @Expensive()
  fetchSceneCollectionsSchema(): Promise<ISceneCollectionSchema[]> {
    return this.sceneCollectionsService.fetchSceneCollectionsSchema();
  }

  /**
   * Creates a new scene collection with the provided options.
   *
   * @param options The options to use for the creation of the new scene
   * collection
   * @returns The scene collection's manifest entry of the new scene collection
   */
  create(options: ISceneCollectionCreateOptions): Promise<ISceneCollectionsManifestEntry> {
    return this.sceneCollectionsService.create(options);
  }

  /**
   * Switches to the scene collection with the provided id.
   *
   * @param id The id of the scene collection to switch to
   */
  load(id: string): Promise<void> {
    return this.sceneCollectionsService.load(id);
  }

  /**
   * Renames the scene collection with the provided id.
   *
   * @param newName The new name of the scene collection to rename
   * @param id The id of the scene collection to rename
   */
  rename(newName: string, id: string): Promise<void> {
    return this.sceneCollectionsService.rename(newName, id);
  }

  /**
   * Deletes a scene collection. If no id is specified, it will delete the
   * current collection.
   *
   * @param id The id of the collection to delete
   */
  async delete(id?: string): Promise<void> {
    return this.sceneCollectionsService.delete(id);
  }

  /**
   * Observable event that is triggered whenever a new scene collection is added.
   * The observed value is the newly added scene collection's manifest entry.
   */
  get collectionAdded(): Observable<ISceneCollectionsManifestEntry> {
    return this.sceneCollectionsService.collectionAdded;
  }

  /**
   * Observable event that is triggered whenever a scene collection is removed.
   * The observed value is the removed scene collection's manifest entry.
   */
  get collectionRemoved(): Observable<ISceneCollectionsManifestEntry> {
    return this.sceneCollectionsService.collectionRemoved;
  }

  /**
   * Observable event that is triggered whenever a scene collection is about to
   * switch. If you want to access the currently active scene collection or need
   * to know to which scene collection will be switched use {@link activeCollection}
   * and {@link collectionSwitched} accordingly.
   */
  get collectionWillSwitch(): Observable<void> {
    return this.sceneCollectionsService.collectionWillSwitch;
  }

  /**
   * Observable event that is triggered after a scene collection has been
   * switched. The observed value is the new currently active scene collection's
   * manifest entry.
   */
  get collectionSwitched(): Observable<ISceneCollectionsManifestEntry> {
    return this.sceneCollectionsService.collectionSwitched;
  }

  /**
   * Observable event that is triggered whenever a scene collection has been
   * updated. This can be for example when the scene collection has been
   * renamed. The observed value is the updated scene collection's manifest
   * entry.
   */
  get collectionUpdated(): Observable<ISceneCollectionsManifestEntry> {
    return this.sceneCollectionsService.collectionUpdated;
  }

  /**
   * @returns The list of manifest entries of all available scene collections.
   */
  get collections(): ISceneCollectionsManifestEntry[] {
    return this.sceneCollectionsService.collections;
  }
}
