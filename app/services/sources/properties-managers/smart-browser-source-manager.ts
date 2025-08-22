import { PropertiesManager } from './properties-manager';
import { Inject } from 'services/core/injector';
import { WebsocketService } from 'services/websocket';
import * as obs from '../../../../obs-api';
import { Subscription } from 'rxjs';
import { VisionService } from 'services/vision';
import uuid from 'uuid/v4';

interface ISourceMessage {
  sourceName: string;
  message: any;
}

export class SmartBrowserSourceManager extends PropertiesManager {
  @Inject() private websocketService: WebsocketService;
  @Inject() visionService: VisionService;
  private socketSub!: Subscription;
  private sseSub!: Subscription;

  init() {
    obs.NodeObs.RegisterSourceMessageCallback(async (evt: ISourceMessage[]) => {
      console.log('SmartBrowserSourceManager: Received source message', evt);
      for (const { sourceName, message } of evt) {
        if (sourceName !== this.obsSource.name) {
          continue;
        }
        const keys = JSON.parse(message).keys;
        const tree = this.convertDotNotationToTree(keys);
        const res = await this.visionService.requestState({ query: tree });
        const payload = JSON.stringify({
          type: 'state.update',
          message: res,
          key: keys?.join(','),
          event_id: uuid(),
        });
        console.log('SmartBrowserSourceManager: Sending message to source', sourceName, payload);
        this.obsSource.sendMessage({
          message: payload,
        });
      }
    });
    this.socketSub = this.websocketService.socketEvent.subscribe(e => {
      console.log('WS event', e);

      if (['visionEvent', 'userStateUpdated'].includes(e.type)) {
        //@ts-ignore
        console.log('success', JSON.stringify(e));
        this.obsSource.sendMessage({ message: JSON.stringify(e) });
      }
    });
    this.visionService.ensureVision();
  }

  destroy() {
    this.socketSub?.unsubscribe();
    this.sseSub?.unsubscribe();
  }

  private convertDotNotationToTree(states: string[] | string): any {
    const tree: any = {};
    const stateArray = Array.isArray(states) ? states : [states];
    stateArray.forEach(state => {
      const parts = state.split('.');
      let current = tree;
      parts.forEach((part, index) => {
        if (!current[part]) {
          current[part] = index === parts.length - 1 ? true : {};
        }
        current = current[part];
      });
    });
    return tree;
  }
}
