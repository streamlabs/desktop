import { InitAfter, Inject, Service } from 'services';
import * as remote from '@electron/remote';
import path from 'path';
import { authorizedHeaders, jfetch } from 'util/requests';
import { HostsService, SourcesService, SettingsService, UserService } from 'app-services';
import { RealmObject } from 'services/realm';
import { ObjectSchema } from 'realm';
import uuid from 'uuid/v4';
import * as obs from '../../../obs-api';
import { convertDotNotationToTree } from 'util/dot-tree';
import { VisionRunner, VisionRunnerStartOptions } from './vision-runner';
import { VisionUpdater } from './vision-updater';
import _ from 'lodash';
import pMemoize from 'p-memoize';
import { ESettingsCategory } from 'services/settings';
import { Subject } from 'rxjs';

export class VisionProcess extends RealmObject {
  game: string;
  pid: number;
  executable_name: string;
  type: string;
  title: string;
  autostart: boolean;

  static schema: ObjectSchema = {
    name: 'VisionProcess',
    properties: {
      game: 'string',
      pid: 'int',
      executable_name: 'string',
      type: 'string',
      title: 'string',
      autostart: 'bool',
    },
  };
}

VisionProcess.register();

export class VisionState extends RealmObject {
  installedVersion: string;
  percentDownloaded: number;
  isCurrentlyUpdating: boolean;
  isInstalling: boolean;
  isStarting: boolean;
  isRunning: boolean;
  pid: number;
  port: number;
  needsUpdate: boolean;
  hasFailedToUpdate: boolean;
  selectedProcessId: number;
  availableProcesses: VisionProcess[];
  availableGames: Dictionary<string>;
  selectedGame: string;

  static schema: ObjectSchema = {
    name: 'VisionState',
    properties: {
      installedVersion: { type: 'string', default: '' },
      percentDownloaded: { type: 'double', default: 0 },
      isCurrentlyUpdating: { type: 'bool', default: false },
      isRunning: { type: 'bool', default: false },
      isInstalling: { type: 'bool', default: false },
      isStarting: { type: 'bool', default: false },
      pid: { type: 'int', default: 0 },
      port: { type: 'int', default: 0 },
      needsUpdate: { type: 'bool', default: false },
      hasFailedToUpdate: { type: 'bool', default: false },
      selectedProcessId: { type: 'int', optional: true },
      availableProcesses: { type: 'list', objectType: 'VisionProcess', default: [] },
      selectedGame: { type: 'string', default: 'fortnite' },
      availableGames: {
        type: 'dictionary',
        objectType: 'string',
        default: {
          apex_legends: 'Apex Legends',
          battlefield_6: 'Battlefield 6',
          black_ops_6: 'Call of Duty: Black Ops 6',
          counter_strike_2: 'Counter-Strike 2',
          fortnite: 'Fortnite',
          league_of_legends: 'League of Legends',
          marvel_rivals: 'Marvel Rivals',
          overwatch_2: 'Overwatch 2',
          pubg: 'PUBG: Battlegrounds',
          rainbow_six_siege: 'Rainbow Six Siege',
          valorant: 'Valorant',
          war_thunder: 'War Thunder',
          warzone: 'Call of Duty: Warzone',
        },
      },
    },
  };
}

VisionState.register();

@InitAfter('UserService')
export class VisionService extends Service {
  private visionRunner = new VisionRunner();
  private visionUpdater = new VisionUpdater(
    path.join(remote.app.getPath('userData'), '..', 'streamlabs-vision'),
  );
  private eventSource: EventSource;

  // update prompt
  private lastPromptAt = 0;
  private lastPromptVersion?: string;
  private promptCooldownMs = 500; // 500ms

  onState = new Subject<{ isRunning: boolean; isStarting: boolean; isInstalling: boolean }>();
  onGame = new Subject<{
    activeProcess: VisionProcess;
    selectedGame: string;
    availableProcesses: VisionProcess[];
  }>();
  @Inject() userService: UserService;
  @Inject() hostsService: HostsService;
  @Inject() private sourcesService: SourcesService;
  @Inject() settingsService: SettingsService;

  state = VisionState.inject();

  init() {
    obs.NodeObs.RegisterSourceMessageCallback(this.onSourceMessageCallback);

    window.addEventListener('beforeunload', () => this.stop());

    this.visionRunner.on('exit', () => {
      this.writeState({
        pid: 0,
        port: 0,
        isRunning: false,
      });
    });

    // useful for testing robustness
    // setInterval(() => this.ensureRunning(), 30_000);
  }

  private onSourceMessageCallback = async (evt: { sourceName: string; message: any }[]) => {
    for (const { sourceName, message } of evt) {
      const source = this.sourcesService.views.getSource(sourceName)?.getObsInput();

      if (!source) {
        continue;
      }

      const keys = JSON.parse(message).keys;
      const tree = convertDotNotationToTree(keys);
      const res = await this.requestState({ query: tree });
      const payload = JSON.stringify({
        type: 'state.update',
        message: res,
        key: keys?.join(','),
        event_id: uuid(),
      });

      source.sendMessage({
        message: payload,
      });
    }
  };

  ensureUpdated = pMemoize(
    async ({ startAfterUpdate = true }: { startAfterUpdate?: boolean } = {}) => {
      this.log('ensureUpdated()');

      this.writeState({ hasFailedToUpdate: false });

      const { needsUpdate, latestManifest } = await this.visionUpdater.checkNeedsUpdate();

      if (needsUpdate) {
        this.writeState({ isCurrentlyUpdating: true });

        // make sure vision is stopped
        await this.visionRunner.stop();

        try {
          await this.visionUpdater.downloadAndInstall(latestManifest, progress => {
            this.writeState({ percentDownloaded: progress.percent });
          });

          this.writeState({
            installedVersion: latestManifest?.version || '',
            needsUpdate: false,
            isCurrentlyUpdating: false,
            percentDownloaded: 0,
          });

          if (startAfterUpdate) {
            return this.ensureRunning();
          }
        } catch (err: unknown) {
          this.writeState({
            needsUpdate: true,
            hasFailedToUpdate: true,
            isCurrentlyUpdating: false,
            percentDownloaded: 0,
          });

          this.log('Error during downloadAndInstall: ', err);
        }
      }
    },
    { cache: false },
  );

  ensureRunning = pMemoize(
    async ({ debugMode = false }: VisionRunnerStartOptions = {}) => {
      this.log('ensureRunning(): { debugMode=', debugMode, ' }');

      this.writeState({ isStarting: true });

      try {
        const {
          needsUpdate,
          installedManifest,
          latestManifest,
        } = await this.visionUpdater.checkNeedsUpdate();

        this.writeState({
          needsUpdate,
          installedVersion: installedManifest?.version ?? '',
        });

        if (needsUpdate) {
          if (installedManifest) {
            this.log(
              `vision needs update: ${installedManifest.version} -> ${latestManifest.version}`,
            );
            // silently update in the background
            await this.ensureUpdated({ startAfterUpdate: false });
          } else {
            const v = latestManifest.version ?? 'unknown';
            const now = Date.now();
            const newVersion = this.lastPromptVersion !== v;
            const cooledDown = now - this.lastPromptAt > this.promptCooldownMs;

            if (newVersion || cooledDown) {
              this.lastPromptVersion = v;
              this.lastPromptAt = now;
              await this.settingsService.showSettings(ESettingsCategory.AI);
            }

            return { started: false, reason: 'needs-update' as const };
          }
        }

        const { pid, port } = await this.visionRunner.ensureStarted({ debugMode });
        this.writeState({ pid, port, isRunning: true });
        this.subscribeToEvents(port);
        await this.requestAvailableProcesses();
        await this.requestActiveProcess();

        return { started: true as const, pid, port };
      } finally {
        // once we're done, we're no longer starting up
        this.writeState({ isStarting: false });
      }
    },
    { cache: false },
  );

  private subscribeToEvents(port: number) {
    this.log('subscribeToEvents()');

    this.eventSource?.close();

    const eventSource = new EventSource(`http://localhost:${port}/events`);

    this.eventSource = eventSource;

    eventSource.onopen = () => this.log('EventSource opened');

    // EventSource auto-reconnects; we just log
    eventSource.onerror = e => this.log('EventSource error:', e, 'state=', eventSource.readyState);

    eventSource.onmessage = e => {
      this.log('EventSource message', e.data);

      try {
        const parsed = JSON.parse(e.data);

        if (
          Array.isArray(parsed.events) &&
          parsed.events.some((x: any) => x.name === 'game_process_detected')
        ) {
          return;
        }

        parsed.vision_event_id = uuid();

        // todo: queue these incase of network failure?
        void this.forwardEventToApi(parsed);
      } catch (err: unknown) {
        this.log('Bad event', err);
      }
    };
  }

  private notifyOfStateChange() {
    this.onState.next({
      isRunning: this.state.isRunning,
      isStarting: this.state.isStarting,
      isInstalling: this.state.isInstalling,
    });

    try {
      const active = this.state.availableProcesses.find(
        p => p.pid === this.state.selectedProcessId,
      );
      const activeJson = JSON.stringify(active);
      const availableJson = JSON.stringify(this.state.availableProcesses || []);

      this.onGame.next({
        activeProcess: JSON.parse(activeJson ?? 'null'),
        selectedGame: this.state.selectedGame,
        availableProcesses: JSON.parse(availableJson),
      });
    } catch (err: unknown) {
      console.error('Error notifying of state change', err);
    }
  }

  async stop() {
    this.closeEventSource();
    await this.visionRunner.stop();
  }

  private log(...args: any[]) {
    console.log('[VisionService]', ...args);
  }

  private closeEventSource() {
    try {
      this.eventSource?.close();
    } catch {
      /* ignore */
    }

    this.eventSource = undefined;
  }

  private async forwardEventToApi(payload: unknown) {
    return await this.authPostWithTimeout(
      `https://${this.hostsService.streamlabs}/api/v5/vision/desktop/event`,
      payload,
      8_000,
    );
  }

  private async requestState(params: unknown) {
    return await this.authPostWithTimeout(
      `https://${this.hostsService.streamlabs}/api/v5/user-state/desktop/query`,
      params,
      8_000,
    );
  }

  private async authPostWithTimeout(url: string, payload: unknown, timeoutMs = 8_000) {
    const headers = authorizedHeaders(
      this.userService.apiToken,
      new Headers({ 'Content-Type': 'application/json' }),
    );

    const controller = new AbortController();
    const { signal } = controller;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await jfetch(url, { headers, method: 'POST', body: JSON.stringify(payload), signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  private writeState(patch: Partial<VisionState>) {
    this.state.db.write(() => Object.assign(this.state, patch));

    this.notifyOfStateChange();
  }

  requestFrame() {
    const url = `http://localhost:${this.state.port}/query/vision_frame`;
    const headers = new Headers({ 'Content-Type': 'application/json' });

    return jfetch(url, { headers, method: 'GET' });
  }

  async requestActiveProcess() {
    const url = `http://localhost:${this.state.port}/processes/active`;
    const headers = new Headers({ 'Content-Type': 'application/json' });
    const response: VisionProcess | undefined = await jfetch(url, { headers, method: 'GET' });

    if (response?.pid !== undefined) {
      this.writeState({ selectedProcessId: response.pid });
    }

    return response;
  }

  async requestAvailableProcesses() {
    const url = `http://localhost:${this.state.port}/processes`;
    const headers = new Headers({ 'Content-Type': 'application/json' });
    const response = await jfetch<VisionProcess[]>(url, { headers, method: 'GET' });

    if (response) {
      this.writeState({ availableProcesses: _.sortBy(response, 'title') });
    }

    return response;
  }

  async activateProcess(pid: number, gameHint: string = 'fortnite') {
    const url = `http://localhost:${this.state.port}/processes/${pid}/activate?game_hint=${gameHint}`;
    const headers = new Headers({ 'Content-Type': 'application/json' });

    const activeProcess = this.state.availableProcesses.find(p => p.pid === pid);
    console.log('Activating process', pid, 'with game hint', gameHint, 'process=', activeProcess);
    if (activeProcess.type === 'capture_device' || activeProcess.executable_name === 'vlc.exe') {
      this.writeState({ selectedProcessId: pid, selectedGame: gameHint });
    } else {
      this.writeState({ selectedProcessId: pid });
    }

    return jfetch(url, { headers, method: 'POST' });
  }

  async resetState() {
    const url = `http://localhost:${this.state.port}/reset_state`;
    const headers = new Headers({ 'Content-Type': 'application/json' });

    return jfetch(url, { headers, method: 'POST' });
  }

  async testEvent(type: string, game: string = 'fortnite') {
    return await this.authPostWithTimeout(
      `https://${this.hostsService.streamlabs}/api/v5/vision/desktop/test-event`,
      {
        game,
        events: [{ name: type }],
      },
      8_000,
    );
  }
}
