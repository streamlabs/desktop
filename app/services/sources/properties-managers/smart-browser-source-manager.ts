import { PropertiesManager } from './properties-manager';
import { Inject } from 'services/core/injector';
import { WebsocketService } from 'services/websocket';
import { Subscription } from 'rxjs'; 

export class SmartBrowserSourceManager extends PropertiesManager {
	@Inject() private websocketService: WebsocketService;

	websocketSub: Subscription;

	init() {
		this.websocketSub = this.websocketService.socketEvent.subscribe(event => {
			console.log('WebSocket event received:', event);
			this.obsSource.sendMessage({
				message: JSON.stringify(event),
			});
		});
	}

	destroy() {
		this.websocketSub.unsubscribe();
	}
}
