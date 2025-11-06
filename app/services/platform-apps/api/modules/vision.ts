import { WebsocketService } from 'app-services';
import { BehaviorSubject, ReplaySubject, Subject, Subscription } from 'rxjs';
import { Inject } from 'services';
import { VisionProcess, VisionService } from 'services/vision';
import { apiEvent, apiMethod, EApiPermissions, IApiContext, Module } from './module';

export class VisionModule extends Module {
  moduleName = 'Vision';
  permissions: EApiPermissions[] = [];

  @Inject() visionService: VisionService;
  @Inject() websocketService: WebsocketService;

  private log(...args: any[]) {
    console.log('[VisionModule]', ...args);
  }

  @apiMethod()
  async startVision() {
    await this.visionService.ensureRunning();
  }

  eventSub: Subscription;

  @apiEvent()
  userState = new BehaviorSubject<Dictionary<number>>({});

  @apiEvent()
  userStateTree = new BehaviorSubject<Dictionary<any>>({});

  @apiEvent()
  visionEvent = new Subject<Dictionary<any>>();

  @apiEvent()
  onVisionStateChanged = new BehaviorSubject<string>('');

  @apiEvent()
  onVisionGameChanged = new BehaviorSubject<{
    activeProcess: VisionProcess;
    selectedGame: string;
    availableProcesses: VisionProcess[];
  }>({ activeProcess: null, selectedGame: 'fortnite', availableProcesses: [] });

  @apiMethod()
  public initiateSubscription() {
    if (!this.eventSub) {
      this.eventSub = this.websocketService.socketEvent.subscribe(e => {
        this.log('Received websocket event: ', JSON.stringify(e, null, 2));
        if (e.type === 'userStateUpdated') {
          // @ts-ignore
          this.userState.next(e.message.updated_states);
          // @ts-ignore
          this.userStateTree.next(e.message.updated_states_tree);
        }

        if (e.type === 'visionEvent') {
          // @ts-ignore
          const event: any = e.message;

          this.visionEvent.next(event);
        }
      });

      this.visionService.onState.subscribe(state => {
        const currentState = this.onVisionStateChanged.getValue();
        let newState = 'stopped';
        if (state.isRunning) newState = 'running';
        else if (state.isStarting) newState = 'starting';
        else if (state.isInstalling) newState = 'installing';

        if (newState !== currentState) {
          this.onVisionStateChanged.next(newState);
        }
      });

      this.visionService.onGame.subscribe(change => {
        const current = this.onVisionGameChanged.getValue();

        if (
          current.activeProcess?.pid === change.activeProcess?.pid &&
          current.selectedGame === change.selectedGame &&
          JSON.stringify(current.availableProcesses) === JSON.stringify(change.availableProcesses)
        ) {
          return;
        }

        this.onVisionGameChanged.next(change);
      });
    }
  }

  @apiMethod()
  async requestAvailableProcesses() {
    return this.visionService.requestAvailableProcesses();
  }

  @apiMethod()
  async requestActiveProcess() {
    return this.visionService.requestActiveProcess();
  }

  @apiMethod()
  async activateProcess(_ctx: IApiContext, pid: number, selectedGame?: string) {
    return this.visionService.activateProcess(pid, selectedGame);
  }

  @apiMethod()
  async requestFrame() {
    return this.visionService.requestFrame();
  }

  @apiMethod()
  async resetState() {
    return this.visionService.resetState();
  }
}
