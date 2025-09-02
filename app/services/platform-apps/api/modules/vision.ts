import { WebsocketService } from 'app-services';
import { BehaviorSubject, Subject, Subscription } from 'rxjs';
import { Inject } from 'services';
import { VisionService } from 'services/vision';
import { apiEvent, apiMethod, EApiPermissions, IApiContext, Module } from './module';

export class VisionModule extends Module {
  moduleName = 'Vision';
  permissions: EApiPermissions[] = [];

  // Can remove when we roll this out generally
  requiresHighlyPrivileged = true;

  @Inject() visionService: VisionService;
  @Inject() websocketService: WebsocketService;

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

  @apiMethod()
  public initiateSubscription() {
    if (!this.eventSub) {
      this.eventSub = this.websocketService.socketEvent.subscribe(e => {
        console.log('Received websocket event:', e);
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
  async activateProcess(_ctx: IApiContext, pid: string) {
    return this.visionService.activateProcess(pid);
  }

  @apiMethod()
  async requestFrame() {
    return this.visionService.requestFrame();
  }
}
