import { InitAfter, Inject, Service } from 'services';
import {
  HostsService,
  SourcesService,
  UrlService,
  UserService,
  WebsocketService,
} from 'app-services';
import { authorizedHeaders, jfetch } from 'util/requests';
import { Subscription } from 'rxjs';
import * as obs from '../../../obs-api';
import uuid from 'uuid/v4';
import { fromDotNotation, toDotNotation } from 'util/dot-tree';
import { USER_STATE_SCHEMA_URL } from 'services/sources/properties-managers/smart-browser-source-manager';
import { RealmObject } from 'services/realm';
import { ObjectSchema } from 'realm';

type TStateTreeLeaf = number | string;
type TStateTreeNode = { [key: string]: TStateTreeLeaf | TStateTreeNode };
type TStateTree = { [key: string]: TStateTreeNode };
type TStateFlat = { [x: `${string}.${string}`]: TStateTreeLeaf };

type TSchemaTreeLeaf = { name: string; aliases?: string[] };
type TSchemaTreeNode = { [key: string]: TSchemaTreeLeaf | TSchemaTreeNode };
type TSchemaTree = { [key: string]: TSchemaTreeNode };
type TSchemaFlat = { [x: `${string}.${string}`]: TSchemaTreeLeaf };

export class ReactiveDataState extends RealmObject {
  schemaFlatJson: string;
  stateFlatJson: string;

  // In-memory caches to avoid repeated JSON parsing
  private _schemaFlatCache: TSchemaFlat | null = null;
  private _stateFlatCache: TStateFlat | null = null;

  static schema: ObjectSchema = {
    name: 'ReactiveDataState',
    properties: {
      schemaFlatJson: { type: 'string', default: '' },
      stateFlatJson: { type: 'string', default: '' },
    },
  };

  get schemaFlat(): TSchemaFlat | null {
    if (!this.schemaFlatJson) return null;
    if (this._schemaFlatCache) return this._schemaFlatCache;
    try {
      this._schemaFlatCache = JSON.parse(this.schemaFlatJson);
      return this._schemaFlatCache;
    } catch {
      return null;
    }
  }

  get stateFlat(): TStateFlat | null {
    if (!this.stateFlatJson) return null;
    if (this._stateFlatCache) return this._stateFlatCache;
    try {
      this._stateFlatCache = JSON.parse(this.stateFlatJson);
      return this._stateFlatCache;
    } catch {
      return null;
    }
  }

  get isSchemaLoaded(): boolean {
    return !!this.schemaFlatJson;
  }

  get isStateLoaded(): boolean {
    return !!this.stateFlatJson;
  }

  invalidateSchemaCache() {
    this._schemaFlatCache = null;
  }

  invalidateStateCache() {
    this._stateFlatCache = null;
  }
}

ReactiveDataState.register();

@InitAfter('UserService')
export class ReactiveDataService extends Service {
  @Inject() userService: UserService;
  @Inject() hostsService: HostsService;
  @Inject() urlService: UrlService;
  @Inject() websocketService: WebsocketService;
  @Inject() sourcesService: SourcesService;

  state = ReactiveDataState.inject();

  private log(...args: any[]) {
    console.log('[ReactiveDataService]', ...args);
  }

  public sourceStateKeyInterest: Map<string, Set<string>> = new Map();
  private socketSub: Subscription;

  init() {
    obs.NodeObs.RegisterSourceMessageCallback(this.onSourceMessageCallback);

    this.fetchSchema().then(schema => {
      this.log('Fetched user state schema:', JSON.stringify(schema).slice(0, 100) + '...');
      const schemaFlat = toDotNotation(
        schema,
        (v): v is TSchemaTreeLeaf => typeof v === 'object' && v !== null && 'name' in v,
      );
      this.state.invalidateSchemaCache();
      this.writeState({ schemaFlatJson: JSON.stringify(schemaFlat) });
    });

    // load everything into our initial state
    this.fetchFullState().then(res => {
      this.log('Fetched full user state:', JSON.stringify(res).slice(0, 100) + '...');
      const stateFlat = toDotNotation(res);
      this.state.invalidateStateCache();
      this.writeState({ stateFlatJson: JSON.stringify(stateFlat) });
    });

    // subscribe to websocket events to keep state updated
    this.socketSub = this.websocketService.socketEvent.subscribe(e => {
      if (['visionEvent', 'userStateUpdated'].includes(e.type)) {
        this.log(e);
      }
    });
  }

  async updateState(changes: Partial<Record<string, number>>) {
    this.log('updateState()', changes);

    const body = JSON.stringify(fromDotNotation(changes));

    try {
      this.log(`PUT https://${this.hostsService.streamlabs}/api/v5/user-state/desktop/offset`);
      this.log(body);

      const resp = await this.authedRequest(
        `https://${this.hostsService.streamlabs}/api/v5/user-state/desktop/offset`,
        { body, method: 'PUT' },
      );

      this.log('response', JSON.stringify(resp, null, 2));

      const currentStateFlat = this.state.stateFlat || {};
      const newStateFlat = { ...currentStateFlat, ...changes };
      this.state.invalidateStateCache();
      this.writeState({ stateFlatJson: JSON.stringify(newStateFlat) });
    } catch (e: unknown) {
      this.log('error updating state:', e);
      throw e;
    }
  }

  async getUserState(keys: string[]) {
    this.log('getUserState()', { keys });

    if (!this.state.isStateLoaded) {
      return undefined;
    }

    // filter stateFlat to only include keys in "keys"
    return Object.fromEntries(
      Object.entries(this.state.stateFlat).filter(([key]) => keys.includes(key)),
    );
  }

  private onSourceMessageCallback = async (evt: { sourceName: string; message: any }[]) => {
    for (const { sourceName, message } of evt) {
      const sourceView = this.sourcesService.views.getSource(sourceName);
      const source = sourceView?.getObsInput();

      if (!source || !sourceView) {
        this.log(`Source ${sourceName} not found`);
        continue;
      }

      const parsed = JSON.parse(message);

      if ('type' in parsed) {
        switch (parsed.type) {
          case 'getState': {
            const key = sourceView.sourceId;

            this.log({
              type: parsed.type,
              keys: parsed.keys,
              sourceName,
              sourceId: key,
            });

            this.sourceStateKeyInterest.set(
              key,
              new Set([...(this.sourceStateKeyInterest.get(key) ?? []), ...parsed.keys]),
            );

            this.log(key, 'using state keys: ', this.sourceStateKeyInterest.get(key));

            const keys = parsed.keys;

            const s = await this.getUserState(keys);

            if (!s) {
              this.log('No state available yet, skipping response to source');
              return;
            }

            const message = toDotNotation(s);

            const payload = JSON.stringify({
              type: 'state.update',
              message,
              key: keys?.join(','),
              event_id: uuid(),
            });

            source.sendMessage({ message: payload });
            return;
          }
        }
      }

      this.log(`unhandled source message from ${sourceName}:`, parsed);
    }
  };

  private async fetchFullState(): Promise<TStateTree> {
    return (await this.authedRequest(
      `https://${this.hostsService.streamlabs}/api/v5/user-state/desktop/query`,
      { body: JSON.stringify({ query: {} }) },
    )) as TStateTree;
  }

  private async authedRequest(
    url: string,
    {
      body,
      timeoutMs = 8_000,
      method = 'POST',
    }: {
      body: string;
      timeoutMs?: number;
      method?: 'POST' | 'PUT';
    },
  ) {
    const headers = authorizedHeaders(
      this.userService.apiToken,
      new Headers({ 'Content-Type': 'application/json' }),
    );

    const controller = new AbortController();
    const { signal } = controller;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await jfetch(url, { headers, method, body, signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  getStateKeysForSource(sourceId: string): string[] {
    return Array.from(this.sourceStateKeyInterest.get(sourceId) ?? []);
  }

  private writeState(patch: Partial<{ schemaFlatJson: string; stateFlatJson: string }>) {
    this.state.db.write(() => Object.assign(this.state, patch));
  }

  private async fetchSchema() {
    return await fetch(USER_STATE_SCHEMA_URL).then(res => res.json() as Promise<TSchemaTree>);
  }
}
