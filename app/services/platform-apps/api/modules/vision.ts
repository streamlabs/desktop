import { VisionService } from 'services/vision';
import { apiEvent, apiMethod, EApiPermissions, Module } from './module';
import { Inject } from 'services';
import { BehaviorSubject, Subject, Subscription } from 'rxjs';
import { WebsocketService } from 'app-services';

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

  private initiateSubscription() {
    if (!this.eventSub) {
      this.eventSub = this.websocketService.socketEvent.subscribe(e => {
        if (e.type === 'userStateUpdated') {
          // @ts-ignore
          this.userState.next(e.message.updated_states);
          // @ts-ignore
          this.userStateTree.next(e.message.updated_states_tree);
        }

        if (e.type === 'visionEvent') {
          // @ts-ignore
          const events: any[] = e.message;

          events.forEach(e => this.visionEvent.next(e));
        }
      });
    }
  }
}
