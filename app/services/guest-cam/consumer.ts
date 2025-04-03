import { IConsumerCreatedEvent, IRemoteProducer, TConnectParams } from '.';
import { Guest } from './guest';
import { MediasoupEntity } from './mediasoup-entity';

export class Consumer extends MediasoupEntity {
  transportCreated = false;
  transportConnected = false;
  guests: Guest[] = [];

  findGuestByStreamId(streamId: string) {
    return this.guests.find(g => g.streamId === streamId);
  }

  addGuest(remoteProducer: IRemoteProducer) {
    const guest = new Guest({ remoteProducer });
    this.guests.push(guest);
    guest.connect();
    this.setConsumerPreferredLayers();
  }

  removeGuest(streamId: string) {
    const idx = this.guests.findIndex(guest => guest.streamId === streamId);

    if (idx > -1) {
      this.guests[idx].destroy();
      this.guests.splice(idx, 1);
    }

    this.setConsumerPreferredLayers();
  }

  setConsumerPreferredLayers() {
    this.guests.forEach(guest => {
      if (!guest.videoTrack) return;
      guest.videoTrack.setConsumerPreferredLayers();
    });
  }

  async createTransport(event: IConsumerCreatedEvent) {
    this.transportCreated = true;
    const turnConfig = await this.guestCamService.getTurnConfig();

    event.data['iceServers'] = [turnConfig];

    this.makeObsRequest('func_create_receive_transport', event.data);
  }

  /**
   * Connects this transport on the server side
   * @param connectParams Data blob the shape of which is opaque to us
   */
  async connectTransport(connectParams: TConnectParams) {
    this.sendWebRTCRequest({
      type: 'connectReceiveTransport',
      data: { ...connectParams },
    });

    this.makeObsRequest('func_connect_result', 'true');

    this.transportConnected = true;

    this.log('Connected Receive Transport');
  }

  destroy() {
    this.guests.forEach(guest => guest.destroy());

    this.makeObsRequest('func_stop_receiver');

    super.destroy();
  }
}
