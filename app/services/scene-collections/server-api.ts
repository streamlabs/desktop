import { Service } from 'services/core/service';
import { Inject } from 'services/core/injector';
import { HostsService } from 'services/hosts';
import { authorizedHeaders, jfetch } from 'util/requests';
import { UserService } from 'services/user';

export interface IServerSceneCollectionCreation {
  name: string;
  data?: string;
  last_updated_at: string;
}

export interface IServerSceneCollection extends IServerSceneCollectionCreation {
  id: number;
}

export interface ISceneCollectionsResponse {
  data: IServerSceneCollection[];
}

/**
 * This service manages interaction with the scene collections
 * server API.
 */
export class SceneCollectionsServerApiService extends Service {
  @Inject() hostsService: HostsService;
  @Inject() userService: UserService;

  /**
   * Fetch a list of all scene collections (doesn't include JSON)
   */
  fetchSceneCollections(): Promise<ISceneCollectionsResponse> {
    const url = `${this.baseUrl}/scene-collection`;
    const request = new Request(url, { headers: this.headers });

    return jfetch(request);
  }

  /**
   * Fetches a list of scene collections with provided ids (includes JSON)
   */
  fetchSceneCollectionsById(
    ids: number[],
  ): Promise<{ scene_collections: IServerSceneCollection[] }> {
    const queryString = ids.map(id => `ids[]=${id}`).join('&');
    const url = `${this.baseUrl}/scene-collection/get-by-ids?${queryString}`;
    const request = new Request(url, { headers: this.headers });

    return jfetch(request);
  }

  /**
   * Fetch a single scene collection (includes JSON)
   */
  fetchSceneCollection(id: number): Promise<{ scene_collection: IServerSceneCollection }> {
    const url = `${this.baseUrl}/scene-collection/${id}`;
    const request = new Request(url, { headers: this.headers });

    return jfetch(request);
  }

  makeSceneCollectionActive(id: number) {
    const url = `${this.baseUrl}/active/scene-collection/${id}`;
    const request = new Request(url, { headers: this.headers, method: 'POST' });

    return jfetch(request);
  }

  createSceneCollection(
    collection: IServerSceneCollectionCreation,
  ): Promise<IServerSceneCollection> {
    const url = `${this.baseUrl}/scene-collection`;
    const headers = this.headers;
    headers.append('Content-Type', 'application/x-www-form-urlencoded');

    const body = this.formSerializeCollection(collection);
    const request = new Request(url, { headers, body, method: 'POST' });

    return jfetch(request);
  }

  updateSceneCollection(collection: IServerSceneCollection) {
    const url = `${this.baseUrl}/scene-collection/${collection.id}`;
    const headers = this.headers;
    headers.append('Content-Type', 'application/x-www-form-urlencoded');

    const body = this.formSerializeCollection(collection);
    const request = new Request(url, { headers, body, method: 'PUT' });

    return jfetch(request);
  }

  deleteSceneCollection(id: number) {
    const url = `${this.baseUrl}/scene-collection/${id}`;
    const request = new Request(url, { headers: this.headers, method: 'DELETE' });

    return jfetch(request);
  }

  private formSerializeCollection(collection: IServerSceneCollectionCreation) {
    const bodyVars: string[] = [];
    bodyVars.push(`name=${encodeURIComponent(collection.name)}`);
    bodyVars.push(`data=${encodeURIComponent(collection.data ?? '')}`);
    bodyVars.push(`last_updated_at=${encodeURIComponent(collection.last_updated_at)}`);
    return bodyVars.join('&');
  }

  private get headers() {
    return authorizedHeaders(this.userService.apiToken);
  }

  private get baseUrl() {
    return `https://${this.hostsService.overlays}/api`;
  }
}
