import { InitAfter, Inject, Service } from 'services';
import * as remote from '@electron/remote';
import { authorizedHeaders, jfetch } from 'util/requests';
import { HostsService, SettingsService, UserService } from 'app-services';
import { RealmObject } from 'services/realm';
import { ObjectSchema } from 'realm';
import uuid from 'uuid/v4';
import { VisionRunnerStartOptions } from './vision-runner';
import _ from 'lodash';
import pMemoize from 'p-memoize';
import { ESettingsCategory } from 'services/settings';
import { Subject } from 'rxjs';

import { GameEvent, StreamlabsVision } from '@streamlabs-core/streamlabs-vision-sdk';

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

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

@InitAfter('UserService')
export class VisionService extends Service {
  private vision = new StreamlabsVision({ debug: true, environment: 'staging' });
  public sourceStateKeyInterest: Map<string, Set<string>> = new Map();

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
  @Inject() settingsService: SettingsService;

  state = VisionState.inject();

  init() {
    window.addEventListener('beforeunload', () => this.stop());

    this.vision.on('stateChange', state => {
      this.log('[State changed]', state);
    });

    this.vision.on('gameEvent', event => {
      this.log('[Game Event]', event.name, event.data);

      // don't forward game_process_detected events to the API
      if (event.name === 'game_process_detected') {
        return;
      }

      const { timestamp, game, ...rest } = event;
      const events = [rest];
      const vision_event_id = uuid();

      void this.forwardEventToApi({ timestamp, game, vision_event_id, events });
    });
  }

  async getDisplayFrameUrl() {
    return await this.vision.getDisplayFrameLink();
  }

  async openDisplayFrame() {
    remote.shell.openExternal(await this.getDisplayFrameUrl());
  }

  ensureUpdated = pMemoize(
    async ({ startAfterUpdate = true }: { startAfterUpdate?: boolean } = {}) => {
      this.log('ensureUpdated()');

      this.writeState({
        hasFailedToUpdate: false,
        isCurrentlyUpdating: true,
        percentDownloaded: 0,
      });

      // Fake progress that auto-cleans up when install completes
      let progress = 0;
      const progressInterval = setInterval(() => {
        // Ease out - progress slows as it approaches 0.9
        progress += (0.9 - progress) * 0.15;
        this.writeState({ percentDownloaded: Math.min(progress, 0.9) });
      }, 500);

      try {
        await this.vision.install();
        clearInterval(progressInterval);
        this.writeState({ percentDownloaded: 1 });

        this.writeState({
          // installedVersion: versionInfo.current_version,
          needsUpdate: false,
          isCurrentlyUpdating: false,
        });

        if (startAfterUpdate) {
          return this.ensureRunning();
        }
      } catch (err: unknown) {
        clearInterval(progressInterval);
        this.writeState({
          hasFailedToUpdate: true,
          needsUpdate: true,
          isCurrentlyUpdating: false,
        });

        this.log('Error during Vision install: ', err);
      }
    },
    { cache: false },
  );

  ensureRunning = pMemoize(
    async ({ debugMode = false }: VisionRunnerStartOptions = {}) => {
      this.log('ensureRunning(): { debugMode=', debugMode, ' }');

      this.writeState({ isStarting: true });

      const isInstalled = await this.vision.isInstalled();

      if (!isInstalled) {
        this.writeState({ needsUpdate: true, installedVersion: '' });

        const v = 'unknown';
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

      this.log('start()');
      await this.vision.start();
      this.log('start() DONE');

      this.log('getVersionInfo()');
      const versionInfo = await this.vision.getVersionInfo();
      this.log({ versionInfo });
      this.log('getVersionInfo() DONE');

      this.writeState({ installedVersion: versionInfo.current_version });

      await this.requestAvailableProcesses();
      await this.requestActiveProcess();
      this.writeState({ isRunning: true });

      return { started: true as const };
    },
    { cache: false },
  );

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
    this.vision.disconnect();
  }

  private log(...args: any[]) {
    console.log('[VisionService]', ...args);
  }

  private async forwardEventToApi(payload: {
    timestamp: number;
    game: string;
    vision_event_id: string;
    events: Omit<GameEvent, 'timestamp' | 'game'>[];
  }) {
    this.log('forwardEventToApi', { payload });

    return await this.authPostWithTimeout(
      `https://${this.hostsService.streamlabs}/api/v5/vision/desktop/event`,
      payload,
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

  async requestFrame() {
    const url = await this.getDisplayFrameUrl();
    const headers = new Headers({ 'Content-Type': 'application/json' });

    return jfetch(url, { headers, method: 'GET' });
  }

  async requestActiveProcess() {
    const response = (await this.vision.getActiveProcess()) as VisionProcess | undefined;

    if (response?.pid !== undefined) {
      this.writeState({ selectedProcessId: response.pid });
    }

    return response;
  }

  async requestAvailableProcesses() {
    const response = (await this.vision.getProcesses()) as VisionProcess[];

    if (response) {
      this.writeState({ availableProcesses: _.sortBy(response, 'title') });
    }

    return response;
  }

  async activateProcess(pid: number, gameHint: string = 'fortnite') {
    const activeProcess = this.state.availableProcesses.find(p => p.pid === pid);
    this.log('Activating process', pid, 'with game hint', gameHint, 'process=', activeProcess);
    if (activeProcess.type === 'capture_device' || activeProcess.executable_name === 'vlc.exe') {
      this.writeState({ selectedProcessId: pid, selectedGame: gameHint });
    } else {
      this.writeState({ selectedProcessId: pid });
    }

    return await this.vision.activateProcess(pid, gameHint);
  }

  async resetState() {
    return await this.vision.resetState();
  }

  async testEvent(type: string) {
    return await this.authPostWithTimeout(
      `https://${this.hostsService.streamlabs}/api/v5/vision/desktop/test-event`,
      {
        game: 'fortnite', // default to fortnite for now
        events: [{ name: type }],
      },
      8_000,
    );
  }
}
