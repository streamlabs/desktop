import { PropertiesManager } from './properties-manager';
import { Inject } from 'services/core/injector';
import { WebsocketService } from 'services/websocket';
import { Subscription } from 'rxjs'; 

export class SmartBrowserSourceManager extends PropertiesManager {
	@Inject() private websocketService: WebsocketService;

	private websocketSub!: Subscription;
  private eventSource!: EventSource;

	init() {
		this.websocketSub = this.websocketService.socketEvent.subscribe(event => {
			console.log('test event sent:', event);
			this.obsSource.sendMessage({
				message: JSON.stringify(event),
			});
		});

		this.eventSource = new EventSource('http://localhost:8000/events');

    this.eventSource.onmessage = (e: MessageEvent) => {
      console.log('SSE event', e.data);
      this.obsSource.sendMessage({
        message: e.data,
      });
    };
	}

	destroy() {
		if (this.websocketSub) {
			this.websocketSub.unsubscribe();
		}
		if (this.eventSource) {
			this.eventSource.close();
		}
	}
}
