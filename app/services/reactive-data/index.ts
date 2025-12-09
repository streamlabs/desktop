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

type StateTreeLeaf = number;
type StateTreeNode = { [key: string]: StateTreeLeaf | StateTreeNode };
type StateTree = { [key: string]: StateTreeNode };

type SchemaTreeLeaf = { name: string; aliases?: string[] };
type SchemaTreeNode = { [key: string]: SchemaTreeLeaf | SchemaTreeNode };
type SchemaTree = { [key: string]: SchemaTreeNode };

export type SchemaFlatType = { [x: `${string}.${string}`]: SchemaTreeLeaf };
export type StateFlatType = { [x: `${string}.${string}`]: number | StateTreeNode };

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export class ReactiveDataState extends RealmObject {
  schemaFlatJson: string;
  stateFlatJson: string;

  static schema: ObjectSchema = {
    name: 'ReactiveDataState',
    properties: {
      schemaFlatJson: { type: 'string', default: '' },
      stateFlatJson: { type: 'string', default: '' },
    },
  };

  get schemaFlat(): SchemaFlatType | null {
    if (!this.schemaFlatJson) return null;
    try {
      return JSON.parse(this.schemaFlatJson);
    } catch {
      return null;
    }
  }

  get stateFlat(): StateFlatType | null {
    if (!this.stateFlatJson) return null;
    try {
      return JSON.parse(this.stateFlatJson);
    } catch {
      return null;
    }
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
  private socketSub!: Subscription;

  init() {
    obs.NodeObs.RegisterSourceMessageCallback(this.onSourceMessageCallback);

    this.fetchSchema().then(schema => {
      this.log('Fetched user state schema:', JSON.stringify(schema).slice(0, 100) + '...');
      const schemaFlat = toDotNotation(
        schema,
        (v): v is SchemaTreeLeaf => typeof v === 'object' && v !== null && 'name' in v,
      );
      this.writeState({ schemaFlatJson: JSON.stringify(schemaFlat) });
    });

    // load everything into our initial state
    this.fetchFullState().then(res => {
      this.log('Fetched full user state:', JSON.stringify(res).slice(0, 100) + '...');
      const stateFlat = toDotNotation(res);
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
      this.writeState({ stateFlatJson: JSON.stringify(newStateFlat) });
    } catch (e: unknown) {
      this.log('error updating state:', e);
      throw e;
    }
  }

  async getUserState(keys: string[]) {
    this.log('getUserState()', { keys });

    if (!this.state.stateFlat) {
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

  private async fetchFullState(): Promise<StateTree> {
    return (await this.authedRequest(
      `https://${this.hostsService.streamlabs}/api/v5/user-state/desktop/query`,
      { body: JSON.stringify({ query: {} }) },
    )) as StateTree;
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
    return await fetch(USER_STATE_SCHEMA_URL).then(res => res.json() as Promise<SchemaTree>);
  }
}
