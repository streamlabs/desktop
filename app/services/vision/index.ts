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
import { Mutex } from 'async-mutex';
import _ from 'lodash';

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
    },
  };
}

VisionState.register();

@InitAfter('UserService')
export class VisionService extends Service {

  private visionRunner = new VisionRunner();
  private visionUpdater = new VisionUpdater(path.join(remote.app.getPath('userData'), '..', 'streamlabs-vision'));
  private eventSource: EventSource;
  private mutex = new Mutex();

  // update prompt
  private lastPromptAt = 0;
  private lastPromptVersion?: string;
  private promptCooldownMs = 5_000; // 5 seconds

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
        isRunning: false
      })
    })

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
  }

  async ensureUpdated({ startAfterUpdate = true }: { startAfterUpdate?: boolean } = {}) {
    this.log('ensureUpdated()');

    return await this.mutex.runExclusive(async () => {
      const { needsUpdate, latestManifest } = await this.visionUpdater.checkNeedsUpdate();

      if (needsUpdate) {
        this.writeState({ isCurrentlyUpdating: true });

        // make sure vision is stopped
        await this.visionRunner.stop();

        await this.visionUpdater.downloadAndInstall(latestManifest, progress => {
          this.writeState({ percentDownloaded: progress.percent });
        });

        this.writeState({
          installedVersion: latestManifest?.version || "",
          needsUpdate: false,
          isCurrentlyUpdating: false,
          percentDownloaded: 0,
        });
      }
    }).then(() => {
      if (startAfterUpdate) {
        return this.ensureRunning();
      }
    });
  }

  async ensureRunning({ debugMode = false }: VisionRunnerStartOptions = {}) {
    this.log('ensureRunning()');

    return await this.mutex.runExclusive(async () => {
      this.writeState({ isStarting: true });

      const { needsUpdate, installedManifest, latestManifest } = await this.visionUpdater.checkNeedsUpdate();

      this.writeState({
        needsUpdate,
        installedVersion: installedManifest?.version || ""
      });

      if (needsUpdate) {
        const v = latestManifest.version ?? 'unknown';
        const now = Date.now();
        const newVersion = this.lastPromptVersion !== v;
        const cooledDown = now - this.lastPromptAt > this.promptCooldownMs;

        if (newVersion || cooledDown) {
          this.lastPromptVersion = v;
          this.lastPromptAt = now;
          this.settingsService.showSettings('Vision');
        }
        return;
      }

      const { pid, port } = await this.visionRunner.ensureStarted({ debugMode });

      this.writeState({
        pid,
        port,
        isRunning: true
      })

      this.subscribeToEvents(port);
    })
      .finally(() => {
        this.writeState({ isStarting: false })
      });
  }

  private subscribeToEvents(port: number) {
    this.log('subscribeToEvents()');

    this.eventSource?.close();

    const eventSource = new EventSource(`http://localhost:${port}/events`);

    this.eventSource = eventSource;

    eventSource.onopen = () => this.log('EventSource opened');

    // EventSource auto-reconnects; we just log
    eventSource.onerror = (e) => this.log('EventSource error:', e, 'state=', eventSource.readyState);

    eventSource.onmessage = (e) => {
      this.log('EventSource message', e.data);

      try {
        const parsed = JSON.parse(e.data);

        if (Array.isArray(parsed.events) && parsed.events.some((x: any) => x.name === 'game_process_detected')) return;

        parsed.vision_event_id = uuid();

        // todo: queue these incase of network failure?
        void this.forwardEventToApi(parsed);
      } catch (err) {
        this.log('Bad event', err);
      }
    };
  }

  async stop() {
    this.closeEventSource();
    await this.visionRunner.stop();
  }

  private log(...args: any[]) { console.log('[VisionService]', ...args); }

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
      8_000
    );
  }

  private async requestState(params: unknown) {
    return await this.authPostWithTimeout(
      `https://${this.hostsService.streamlabs}/api/v5/user-state/desktop/query`,
      params,
      8_000
    );
  }

  private async authPostWithTimeout(url: string, payload: unknown, timeoutMs = 8_000) {
    const headers = authorizedHeaders(this.userService.apiToken, new Headers({ 'Content-Type': 'application/json' }));

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
  }
}
