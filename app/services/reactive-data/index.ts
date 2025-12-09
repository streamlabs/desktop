import { InitAfter, Inject, Service, StatefulService } from 'services';
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

type StateTreeLeaf = number;
type StateTreeNode = { [key: string]: StateTreeLeaf | StateTreeNode };
type StateTree = { [key: string]: StateTreeNode };

type SchemaTreeLeaf = { name: string; aliases?: string[] };
type SchemaTreeNode = { [key: string]: SchemaTreeLeaf | SchemaTreeNode };
type SchemaTree = { [key: string]: SchemaTreeNode };

type ReactiveDataServiceState = {
  schemaFlat?: { [x: `${string}.${string}`]: SchemaTreeLeaf };
  stateFlat?: { [x: `${string}.${string}`]: number | StateTreeNode };
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

@InitAfter('UserService')
export class ReactiveDataService extends StatefulService<ReactiveDataServiceState> {
  @Inject() userService: UserService;
  @Inject() hostsService: HostsService;
  @Inject() urlService: UrlService;
  @Inject() websocketService: WebsocketService;
  @Inject() sourcesService: SourcesService;

  static initialState = {
    schemaFlat: undefined,
    stateFlat: undefined,
  } as ReactiveDataServiceState;

  private log(...args: any[]) {
    console.log('[ReactiveDataService]', ...args);
  }

  public sourceStateKeyInterest: Map<string, Set<string>> = new Map();
  private socketSub!: Subscription;

  init() {
    obs.NodeObs.RegisterSourceMessageCallback(this.onSourceMessageCallback);

    this.fetchSchema().then(schema => {
      this.log('Fetched user state schema:', JSON.stringify(schema).slice(0, 100) + '...');
      this.state.schemaFlat = toDotNotation(
        schema,
        (v): v is SchemaTreeLeaf => typeof v === 'object' && v !== null && 'name' in v,
      );
    });

    // load everything into our initial state
    this.fetchFullState().then(res => {
      this.log('Fetched full user state:', JSON.stringify(res).slice(0, 100) + '...');
      this.state.stateFlat = toDotNotation(res);
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

      this.state.stateFlat = { ...this.state.stateFlat, ...changes };
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

  private async fetchSchema() {
    return await fetch(USER_STATE_SCHEMA_URL).then(res => res.json() as Promise<SchemaTree>);
  }
}
