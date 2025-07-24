import { authorizedHeaders, jfetch } from 'util/requests';
import { importSocketIOClient } from 'util/slow-imports';
import { InitAfter, Inject, mutation, StatefulService, Service, ViewHandler } from 'services/core';
import { UserService } from 'services/user';
import uuid from 'uuid/v4';
import { SourcesService } from 'services/sources';
import { ScenesService } from 'services/scenes';
import { EFilterDisplayType, SourceFiltersService } from 'services/source-filters';
import { Subject } from 'rxjs';
import { HardwareService } from 'services/hardware';
import { Producer } from './producer';
import { Consumer } from './consumer';
import { byOS, OS } from 'util/operating-systems';
import { Mutex } from 'util/mutex';
import Utils from 'services/utils';
import { AudioService, E_AUDIO_CHANNELS } from 'services/audio';
import {
  NotificationsService,
  SceneCollectionsService,
  UrlService,
  StreamingService,
  UsageStatisticsService,
  AppService,
  DismissablesService,
  IncrementalRolloutService,
} from 'app-services';
import { ENotificationType } from 'services/notifications';
import { $t } from 'services/i18n';
import { JsonrpcService } from 'services/api/jsonrpc';
import { EStreamingState } from 'services/streaming';
import Vue from 'vue';
import { EDismissable } from 'services/dismissables';
import { EAvailableFeatures } from 'services/incremental-rollout';
import { assertIsDefined } from 'util/properties-type-guards';

/**
 * This is in actuality a big data blob at runtime, the shape
 * of which we don't care about. This effectively implements this
 * as an opaque type that we don't do anything to and just pass along.
 */
export type TConnectParams = { __type: 'ConnectParams' };

/**
 * Interface describing the various functions and expected return values
 * we can make to the plugin using `callHandler`
 */
export interface IObsReturnTypes {
  func_create_send_transport: {};
  func_load_device: {};
  func_create_audio_producer: {
    produce_params?: {
      rtpParameters: unknown;
      kind: string;
      transportId: string;
    };
    connect_params?: TConnectParams;
  };
  func_create_video_producer: {
    produce_params?: {
      rtpParameters: unknown;
      kind: string;
      transportId: string;
    };
    connect_params?: TConnectParams;
  };
  func_connect_result: {
    produce_params: {
      rtpParameters: unknown;
      kind: string;
      transportId: string;
    };
  };
  func_produce_result: {};
  func_create_receive_transport: {};
  func_video_consumer_response: {
    connect_params: TConnectParams;
  };
  func_audio_consumer_response: {
    connect_params: TConnectParams;
  };
  func_stop_consumer: {};
  func_stop_sender: {};
  func_stop_receiver: {};
  func_stop_producer: {};
}

interface IRoomResponse {
  room: string;
  hash: string;
}

interface IIoConfigResponse {
  url: string;
  token: string;
  host: {
    name: string;
    maxGuests: number;
  };
}

type TWebRTCSocketEvent =
  | IProducerCreatedEvent
  | IConsumerCreatedEvent
  | IConsumerTrackEvent
  | IConsumerDestroyedEvent;

/**
 * Contains all the information about a guest we get from
 * the server whenever a new guest joins.
 */
export interface IRemoteProducer {
  audioId: string;
  name: string;
  socketId: string;
  streamId: string;
  type: string;
  videoId: string;
}

interface IProducerCreatedEvent {
  type: 'producerCreated';
  data: IRemoteProducer;
}

export interface IConsumerCreatedEvent {
  type: 'consumerCreated';
  data: {
    dtlsParameters: unknown;
    iceCandidates: unknown;
    iceParameters: unknown;
    id: string;
    socketId: string;
    streamId: string;
  };
}

export interface IConsumerTrackEvent {
  type: 'consumerTrack';
  data: {
    kind: 'audio' | 'video';
    paused: boolean;
    producerId: string;
    id: string;
  };
}

// TODO: What does this look like?
interface IConsumerDestroyedEvent {
  type: 'consumerDestroyed';
  data: {
    socketId: string;
    streamId: string;
  };
}

interface ISocketAuthResponse {
  success: boolean;
  rtpCapabilities: unknown;
}

interface ITurnConfig {
  expires_at: number;
  credential: string;
  urls: string[];
  username: string;
}

export interface IGuest {
  remoteProducer: IRemoteProducer;
  sourceId?: string;
  showOnStream: boolean;
  notificationId: number;
}

interface IGuestCamServiceState {
  produceOk: boolean;
  videoSourceId: string;
  audioSourceId: string;
  screenshareSourceId: string;
  inviteHash: string;

  guests: IGuest[];

  /**
   * If we are connecting to as a guest to someone else's stream, this will
   * be set to the hash.
   */
  joinAsGuestHash: string | null;

  /**
   * Name of the host of the room
   */
  hostName: string;

  /**
   * Number includes the host
   */
  maxGuests: number;
}

class GuestCamViews extends ViewHandler<IGuestCamServiceState> {
  get videoSourceId() {
    return this.state.videoSourceId;
  }

  get videoSource() {
    return this.getServiceViews(SourcesService).getSource(this.videoSourceId);
  }

  get audioSourceId() {
    return this.state.audioSourceId;
  }

  get audioSource() {
    return this.getServiceViews(SourcesService).getSource(this.audioSourceId);
  }

  get screenshareSourceId() {
    return this.state.screenshareSourceId;
  }

  get screenshareSource() {
    return this.getServiceViews(SourcesService).getSource(this.screenshareSourceId);
  }

  get sources() {
    return this.getServiceViews(SourcesService).getSourcesByType('mediasoupconnector');
  }

  get sourceId() {
    return this.sources[0]?.sourceId;
  }

  get source() {
    return this.getServiceViews(SourcesService).getSource(this.sourceId);
  }

  get deflection() {
    return this.getServiceViews(AudioService).getSource(this.sourceId).fader.deflection;
  }

  get inviteUrl() {
    return `https://join.streamlabs.com/j/${this.state.inviteHash}`;
  }

  get guestVisible() {
    return !this.source?.forceHidden;
  }

  /**
   * A list of sources which don't currently have a guest assigned
   */
  get vacantSources() {
    return this.sources.filter(source => {
      return this.state.guests.every(guest => guest.sourceId !== source.sourceId);
    });
  }

  getGuestByStreamId(streamId: string) {
    return this.state.guests.find(g => g.remoteProducer.streamId === streamId);
  }

  getSourceForGuest(streamId: string) {
    const guest = this.getGuestByStreamId(streamId);
    if (!guest) return null;
    if (!guest.sourceId) return null;

    return this.getServiceViews(SourcesService).getSource(guest.sourceId);
  }

  getGuestBySourceId(sourceId: string) {
    return this.state.guests.find(g => g.sourceId === sourceId);
  }
}

@InitAfter('SceneCollectionsService')
export class GuestCamService extends StatefulService<IGuestCamServiceState> {
  @Inject() userService: UserService;
  @Inject() sourcesService: SourcesService;
  @Inject() scenesService: ScenesService;
  @Inject() sourceFiltersService: SourceFiltersService;
  @Inject() hardwareService: HardwareService;
  @Inject() sceneCollectionsService: SceneCollectionsService;
  @Inject() notificationsService: NotificationsService;
  @Inject() jsonrpcService: JsonrpcService;
  @Inject() urlService: UrlService;
  @Inject() streamingService: StreamingService;
  @Inject() usageStatisticsService: UsageStatisticsService;
  @Inject() appService: AppService;
  @Inject() dismissablesService: DismissablesService;
  @Inject() incrementalRolloutService: IncrementalRolloutService;

  static initialState: IGuestCamServiceState = {
    produceOk: false,
    videoSourceId: '',
    audioSourceId: '',
    screenshareSourceId: '',
    inviteHash: '',
    guests: [],
    joinAsGuestHash: null,
    hostName: null,
    maxGuests: 2,
  };

  get views() {
    return new GuestCamViews(this.state);
  }

  /**
   * Event bus for various utility classes to subscribe/unsubscribe
   * from webrtc events coming over the socket.
   */
  webrtcEvent = new Subject<TWebRTCSocketEvent>();

  io: SocketIOClientStatic;
  socket: SocketIOClient.Socket;
  room: string;
  auth: ISocketAuthResponse;

  producer: Producer;
  consumer: Consumer;

  /**
   * The mediasoup plugin will get in a bad state if we try setting
   * up the consumer while the producer is being set up. This mutex
   * ensures that only one operation accesses the plugin at a time.
   */
  pluginMutex = new Mutex();

  /**
   * Used to ensure we don't try to clean up or start a new socket
   * connect while we are in the process of initializing it.
   */
  socketMutex = new Mutex();

  turnConfig: ITurnConfig;

  init() {
    super.init();

    this.sourcesService.sourceRemoved.subscribe(s => {
      if (s.type === 'mediasoupconnector') {
        // Make sure source is unassigned
        const guest = this.views.getGuestBySourceId(s.sourceId);

        if (guest) {
          this.setGuestSource(guest.remoteProducer.streamId, null);
        }

        // Only clean up if this is the last mediasoup source
        // There is no use case for multiple sources right now, but
        // we shouldn't break in this scenario
        if (this.sourcesService.views.getSourcesByType('mediasoupconnector').length) return;

        this.cleanUpSocketConnection();
      }
    });

    // Make sure we do this after every single load of the scene collection.
    // This will ensure that if the scene collection did not contain valid
    // sources, we will choose the best ones we can.
    this.sceneCollectionsService.collectionSwitched.subscribe(() => {
      this.findDefaultSources();
    });

    // Stop screen sharing if the user switches scenes as the source might not be available in the new scene
    // TODO: consider checking if the source is in the new scene and don't stop sharing if so, might be expensive
    this.scenesService.sceneSwitched.subscribe(() => {
      if (this.views.screenshareSource) {
        this.setScreenshareSource(null);
      }
    });

    this.streamingService.streamingStatusChange.subscribe(status => {
      if ([EStreamingState.Live, EStreamingState.Offline].includes(status)) {
        this.emitStreamingStatus();
      }

      if (status === EStreamingState.Offline) {
        this.streamRecorded = false;
      }

      if (status === EStreamingState.Live) {
        this.recordStreamAnalytics();
      }
    });

    this.incrementalRolloutService.featuresReady.then(() => {
      if (this.appService.state.onboarded) {
        // If this is a new user, they should never see this notification. It's only for
        // existing users who are newly rolled out to.
        this.dismissablesService.dismiss(EDismissable.CollabCamRollout);
      } else if (
        this.incrementalRolloutService.views.featureIsEnabled(
          EAvailableFeatures.guestCamProduction,
        ) &&
        this.dismissablesService.views.shouldShow(EDismissable.CollabCamRollout)
      ) {
        this.dismissablesService.dismiss(EDismissable.CollabCamRollout);
        this.notificationsService.push({
          type: ENotificationType.SUCCESS,
          lifeTime: -1,
          message: $t('You now have access to Collab Cam!'),
          action: this.jsonrpcService.createRequest(
            Service.getResourceId(this.sourcesService),
            'showGuestCamProperties',
          ),
        });
      }
    });

    this.userService.userLogout.subscribe(() => {
      this.SET_MAX_GUESTS(2);
      this.SET_PRODUCE_OK(false);
      this.cleanUpSocketConnection();
    });
  }

  findDefaultSources() {
    if (
      !this.state.audioSourceId ||
      !this.sourcesService.views.getSource(this.state.audioSourceId)
    ) {
      // Check input channels first
      let audioSource = [
        E_AUDIO_CHANNELS.INPUT_1,
        E_AUDIO_CHANNELS.INPUT_2,
        E_AUDIO_CHANNELS.INPUT_3,
      ]
        .map(channel => {
          return this.sourcesService.views.getSourceByChannel(channel);
        })
        .find(s => s);

      // Fall back to *any* audio source
      if (!audioSource) {
        const sourceType = byOS({
          [OS.Windows]: 'wasapi_input_capture',
          [OS.Mac]: 'coreaudio_input_capture',
        });

        audioSource = this.sourcesService.views.sources.find(s => s.type === sourceType);
      }

      if (audioSource) this.SET_AUDIO_SOURCE(audioSource.sourceId);
    }

    if (
      !this.state.videoSourceId ||
      !this.sourcesService.views.getSource(this.state.videoSourceId)
    ) {
      const sourceType = byOS({ [OS.Windows]: 'dshow_input', [OS.Mac]: 'av_capture_input' });
      const videoSource = this.sourcesService.views.sources.find(s => s.type === sourceType);

      if (videoSource) this.SET_VIDEO_SOURCE(videoSource.sourceId);
    }
  }

  emitStreamingStatus() {
    if (!this.socket) return;

    this.socket.emit('message', {
      target: '*',
      type: 'streamingStatusChange',
      data: {
        live: this.streamingService.views.streamingStatus === EStreamingState.Live,
        chatUrl: this.streamingService.views.chatUrl,
      },
    });
  }

  emitGuestStatus(streamId: string, visible: boolean) {
    this.socket.emit('message', {
      target: '*',
      type: 'guestStatus',
      data: {
        streamId,
        visible,
      },
    });
  }

  async getSocketConfig() {
    const roomUrl = this.urlService.getStreamlabsApi('streamrooms/current');
    const roomResult = await jfetch<IRoomResponse>(roomUrl, {
      headers: authorizedHeaders(this.userService.views.auth.apiToken),
    });

    this.log('Room result', roomResult);

    this.SET_INVITE_HASH(roomResult.hash);

    this.room = roomResult.room;

    let ioConfigResult: IIoConfigResponse;

    if (Utils.env.SLD_GUEST_CAM_HASH ?? this.state.joinAsGuestHash) {
      const url = this.urlService.getStreamlabsApi(
        `streamrooms/io/config/${Utils.env.SLD_GUEST_CAM_HASH ?? this.state.joinAsGuestHash}`,
      );
      ioConfigResult = await jfetch<IIoConfigResponse>(url);
    } else {
      const ioConfigUrl = this.urlService.getStreamlabsApi('streamrooms/io/config');
      ioConfigResult = await jfetch<IIoConfigResponse>(ioConfigUrl, {
        headers: authorizedHeaders(this.userService.views.auth.apiToken),
      });
    }

    this.log('io Config Result', ioConfigResult);

    this.SET_HOST_NAME(ioConfigResult.host.name);
    this.SET_MAX_GUESTS(ioConfigResult.host.maxGuests);

    return ioConfigResult;
  }

  async startListeningForGuests() {
    await this.socketMutex.do(async () => {
      if (!this.state.produceOk && !this.state.joinAsGuestHash) return;

      if (this.socket) return;

      if (!this.userService.views.isLoggedIn) return;

      const ioConfigResult = await this.getSocketConfig();

      await this.openSocketConnection(ioConfigResult.url, ioConfigResult.token);
    });
  }

  async regenerateInviteLink() {
    const regenerateUrl = this.urlService.getStreamlabsApi('streamrooms/regenerate');
    const regenerateResult = await jfetch<{ hash: string }>(regenerateUrl, {
      headers: authorizedHeaders(this.userService.views.auth.apiToken),
      method: 'POST',
    });
    this.SET_INVITE_HASH(regenerateResult.hash);
  }

  /**
   * This should be called when we are attempting to join somebody else's
   * stream as a guest.
   * @param inviteHash The invite code of the room to join
   */
  async joinAsGuest(inviteHash: string) {
    if (!inviteHash) return;

    await this.cleanUpSocketConnection();
    this.SET_JOIN_AS_GUEST(inviteHash);
    this.SET_PRODUCE_OK(false);
    if (this.views.sourceId) {
      await this.startListeningForGuests();
      this.sourcesService.showGuestCamPropertiesBySourceId(this.views.sourceId);
    } else {
      // User will be prompted to add a source
      this.sourcesService.showGuestCamProperties();
    }
  }

  async setProduceOk() {
    this.SET_PRODUCE_OK(true);

    // We've already called these methods once in `joinAsGuest`, avoid doing it again
    if (!this.state.inviteHash) {
      await this.cleanUpSocketConnection();
      await this.startListeningForGuests();
    }

    // If a guest is already connected and we are not yet producing, start doing so now.
    // If we are joined as a guest, we should also start producing first.
    if (!this.producer && (this.consumer || this.state.joinAsGuestHash)) {
      this.startProducing();
    }
  }

  /**
   * The main function to connect to the remote service with A/V.
   * The following will happen:
   * - We will ensure sources/filters are set up properly
   * - We will start sending A/V to the remote server
   */
  async startProducing() {
    // TODO: What happens if the producer isn't working?
    if (this.producer) return;

    // Don't hold up starting the producer if the filters can't be created
    try {
      this.ensureSourceAndFilters();
    } catch (e: unknown) {
      this.log('Unable to ensure filters but continuing with producer creation', e);
    }

    // It doesn't matter which source we produce from, so just pick the first one
    this.producer = new Producer(this.views.sources[0].sourceId);

    await this.producer.addStream('camera', this.views.videoSourceId, this.views.audioSourceId);

    if (this.views.screenshareSource) {
      await this.producer.addStream('screenshare', this.views.screenshareSourceId);
    }
  }

  stopProducing() {
    this.producer.destroy();
    this.producer = null;
  }

  /**
   * Ensures the following:
   * - We have at least 1 guest cam source
   * - Removes all existing filters
   */
  private ensureSourceAndFilters() {
    if (!this.views.sourceId) {
      throw new Error('Tried to start producer but mediasoup source does not exist');
    }

    // Remove all existing mediasoup filters
    Object.keys(this.sourceFiltersService.state.filters).forEach(sourceId => {
      this.sourceFiltersService.views.filtersBySourceId(sourceId, true).forEach(filter => {
        if (['mediasoupconnector_afilter', 'mediasoupconnector_vfilter'].includes(filter.type)) {
          this.sourceFiltersService.remove(sourceId, filter.name);
        }
      });
    });
  }

  async getTurnConfig() {
    if (this.turnConfig && this.turnConfig.expires_at > Date.now()) {
      return this.turnConfig;
    }

    let turnConfigResult: ITurnConfig;

    if (Utils.env.SLD_GUEST_CAM_HASH ?? this.state.joinAsGuestHash) {
      const url = this.urlService.getStreamlabsApi(
        `streamrooms/turn/config/${Utils.env.SLD_GUEST_CAM_HASH ?? this.state.joinAsGuestHash}`,
      );
      turnConfigResult = await jfetch<ITurnConfig>(url);
    } else {
      const turnConfigUrl = this.urlService.getStreamlabsApi('streamrooms/turn/config');
      turnConfigResult = await jfetch<ITurnConfig>(turnConfigUrl, {
        headers: authorizedHeaders(this.userService.views.auth.apiToken),
      });
    }

    this.log('Fetched new TURN config', turnConfigResult);

    return turnConfigResult;
  }

  async openSocketConnection(url: string, token: string) {
    // dynamically import socket.io because it takes to much time to import it on startup
    if (!this.io) {
      this.io = (await importSocketIOClient()).default;
    }

    if (this.socket) {
      this.socket.disconnect();
    }

    this.socket = this.io(url, {
      transports: ['websocket'],
      reconnectionDelay: 5000,
      reconnectionDelayMax: 20000,
      timeout: 5000,
    });

    this.socket.on('connect', async () => {
      this.log('Socket Connected');

      this.auth = await this.authenticateSocket(token);
      this.log('Socket Authenticated', this.auth);

      // this.views.source.updateSettings({ room: this.room });
      this.views.sources.forEach(source => {
        source.updateSettings({ room: this.room });
      });

      // It doesn't matter which source we call this on
      this.makeObsRequest(
        this.views.sources[0].sourceId,
        'func_load_device',
        this.auth.rtpCapabilities,
      );
    });
    this.socket.on('connect_error', (e: any) => this.log('Connection Error', e));
    this.socket.on('connect_timeout', () => this.log('Connection Timeout'));
    this.socket.on('error', () => this.log('Socket Error'));
    this.socket.on('disconnect', this.handleDisconnect.bind(this));
    this.socket.on('webrtc', (e: TWebRTCSocketEvent) => this.onWebRTC(e));
  }

  handleDisconnect(reason: string) {
    this.log('Socket Disconnected!', 'reason: ', reason);

    if (reason === 'io server disconnect') {
      // the disconnection was initiated by the server, we need to try to reconnect manually
      // assuming this is the behavior we get when token expires, before that, we should
      // regen the URL
      this.getSocketConfig().then(ioConfigResult => {
        this.openSocketConnection(ioConfigResult.url, ioConfigResult.token);
      });

      return;
    }

    if (this.consumer) {
      this.consumer.destroy();
      this.consumer = null;
    }

    if (this.producer) {
      this.producer.destroy();
      this.producer = null;
    }

    this.CLEAR_GUESTS();
  }

  onWebRTC(event: TWebRTCSocketEvent) {
    this.log('WebRTC Event', event);

    this.webrtcEvent.next(event);

    if (event.type === 'producerCreated') {
      this.onGuestJoin(event);
    } else if (event.type === 'consumerDestroyed') {
      this.onGuestLeave(event);
    }
  }

  async onGuestJoin(event: IProducerCreatedEvent) {
    if (this.socket.id === event.data.socketId) {
      this.log('onProducerCreated fired - ignoring our own producer');
      return;
    }

    if (this.disconnectedStreamIds.includes(event.data.streamId)) {
      this.log(`Ignoring previously disconnected stream id ${event.data.streamId}`);
      return;
    }

    this.log('New guest joined', event);

    // If we have a vacant source, assign the guest now
    const vacantSources = this.views.vacantSources;
    const sourceId = vacantSources.length ? vacantSources[0].sourceId : undefined;

    const notif = this.notificationsService.push({
      type: ENotificationType.SUCCESS,
      lifeTime: -1,
      message: $t('A guest has joined - click to show'),
      action: this.jsonrpcService.createRequest(
        Service.getResourceId(this.sourcesService),
        'showGuestCamPropertiesBySourceId',
        this.views.sourceId,
      ),
    });

    this.ADD_GUEST({
      remoteProducer: event.data,
      sourceId,
      showOnStream: false,
      notificationId: notif.id,
    });

    // If we're allowed to produce, we should start producing right now
    if (!this.producer && this.state.produceOk) {
      this.startProducing();
    }

    if (!this.consumer) {
      this.consumer = new Consumer(this.views.sources[0].sourceId);
    }

    this.consumer.addGuest(event.data);

    if (sourceId) {
      this.setGuestSource(event.data.streamId, sourceId);
    }

    this.emitStreamingStatus();
    this.recordStreamAnalytics();
    this.recordGuestAnalytics();
    this.usageStatisticsService.recordFeatureUsage('CollabCam');
  }

  /**
   * Mark's a guests join notification as read
   * @param streamId the stream id of the guest
   */
  markGuestAsRead(streamId: string) {
    const guest = this.views.getGuestByStreamId(streamId);

    if (!guest) return;

    this.notificationsService.markAsRead(guest.notificationId);
  }

  setGuestSource(streamId: string, sourceId: string | null) {
    const guest = this.views.getGuestByStreamId(streamId);

    if (!guest) return;

    const guestConsumer = this.consumer.guests.find(
      g => g.opts.remoteProducer.streamId === streamId,
    );

    if (!guestConsumer) return;

    const source = this.sourcesService.views.getSource(sourceId);

    if (source) {
      // If there's already a guest connected on this source, we need
      // to unassign it.
      const existingGuest = this.views.getGuestBySourceId(sourceId);

      if (existingGuest) {
        const existingConsumer = this.consumer.findGuestByStreamId(
          existingGuest.remoteProducer.streamId,
        );

        if (existingConsumer) {
          existingConsumer.setSource();
        }

        this.UPDATE_GUEST(existingGuest.remoteProducer.streamId, { sourceId: null });
      }

      source.setForceHidden(!guest.showOnStream);
      source.setForceMuted(!guest.showOnStream);
    }

    guestConsumer.setSource(sourceId);
    this.UPDATE_GUEST(streamId, { sourceId });
  }

  disconnectedStreamIds: string[] = [];

  /**
   * Disconnects the currently connected guest
   */
  async disconnectGuest(streamId: string, kick = false) {
    const guest = this.views.getGuestByStreamId(streamId);

    if (guest) {
      if (kick) {
        this.socket.emit('message', {
          target: '*',
          type: 'kick',
          data: { streamId },
        });

        // TODO: Need to implement kick message handling on guest page
        this.disconnectedStreamIds.push(guest.remoteProducer.streamId);
      }

      if (this.consumer) {
        this.consumer.removeGuest(guest.remoteProducer.streamId);
      }

      this.REMOVE_GUEST(guest.remoteProducer.streamId);
    }

    if (this.state.guests.length === 0) {
      await this.cleanUpSocketConnection();
      await this.startListeningForGuests();
    }
  }

  /**
   * Should only be called if we are joining from Desktop as a guest.
   * Will disconnect from the host and rejoin our own room.
   */
  async disconnectFromHost() {
    if (!this.state.joinAsGuestHash) return;

    this.SET_JOIN_AS_GUEST(null);
    await this.cleanUpSocketConnection();
    await this.startListeningForGuests();
  }

  async cleanUpSocketConnection() {
    await this.socketMutex.synchronize();

    if (!this.socket) return;

    if (this.consumer) {
      this.consumer.destroy();
      this.consumer = null;
    }

    // Also stop sending our mic/video
    // When we do multi-guest this will need to change
    if (this.producer) {
      this.producer.destroy();
      this.producer = null;
    }

    // TODO: AFAIK there is no way to cleanly recreate the producer without
    // entirely disconnecting destroying all state on the server. For now, we
    // disconnect from the socket and start listening to guests again.
    this.socket.disconnect();
    this.socket = null;
    this.CLEAR_GUESTS();
  }

  setVisibility(sourceId: string, visible: boolean) {
    const source = this.sourcesService.views.getSource(sourceId);
    if (!source) return;

    source.setForceHidden(!visible);
    source.setForceMuted(!visible);

    const guest = this.views.getGuestBySourceId(sourceId);
    this.UPDATE_GUEST(guest.remoteProducer.streamId, { showOnStream: visible });
    this.emitGuestStatus(guest.remoteProducer.streamId, visible);
  }

  async onGuestLeave(event: IConsumerDestroyedEvent) {
    this.log('Guest left', event);

    this.disconnectGuest(event.data.streamId);
  }

  async authenticateSocket(token: string): Promise<ISocketAuthResponse> {
    return new Promise(r => {
      this.socket.emit(
        'authenticate',
        { token, username: this.userService.views.platform.username },
        r,
      );
    });
  }

  sendWebRTCRequest(data: Object) {
    return new Promise(resolve => {
      this.socket.emit('webrtc', data, (result: Object) => {
        // TODO: index
        // @ts-ignore
        if (result && result['error']) {
          // TODO: index
          // @ts-ignore
          this.error(`Got error response from request ${data['type']}`);
        }

        resolve(result);
      });
    });
  }

  makeObsRequest<TFunc extends keyof IObsReturnTypes>(
    sourceId: string,
    func: TFunc,
    arg?: Object,
  ): IObsReturnTypes[TFunc] {
    let stringArg = arg ?? '';

    if (typeof stringArg === 'object') {
      stringArg = JSON.stringify(arg);
    }

    if (typeof stringArg !== 'string') {
      throw new Error(`Unsupported arg type for OBS call ${arg}`);
    }

    const source = this.sourcesService.views.getSource(sourceId);

    // If underlying source is destroyed, do nothing
    if (!source) {
      this.log(`Ignoring OBS call ${func} due to source not existing`);
      return;
    }

    let result = (source.getObsInput().callHandler(func, stringArg) as any).output;

    if (result !== '') {
      result = JSON.parse(result);
    }

    // Attempt to parse keys as JSON
    Object.keys(result).forEach(k => {
      if (typeof result[k] === 'string') {
        try {
          result[k] = JSON.parse(result[k]);
        } catch {}
      }
    });

    return result;
  }

  log(...msgs: unknown[]) {
    console.log('[Guest Cam]', ...msgs);
  }

  error(...msgs: unknown[]) {
    console.error('[Guest Cam]', ...msgs);
  }

  setVideoSource(sourceId: string) {
    if (!this.sourcesService.views.getSource(sourceId)) return;

    this.SET_VIDEO_SOURCE(sourceId);

    if (this.producer && this.views.sourceId) {
      this.producer.setStreamSource(sourceId, this.producer.cameraStreamId, 'video');
    }
  }

  setAudioSource(sourceId: string) {
    if (!this.sourcesService.views.getSource(sourceId)) return;

    this.SET_AUDIO_SOURCE(sourceId);

    if (this.producer && this.views.sourceId) {
      this.producer.setStreamSource(sourceId, this.producer.cameraStreamId, 'audio');
    }
  }

  setScreenshareSource(sourceId?: string) {
    this.SET_SCREENSHARE_SOURCE(sourceId ?? '');

    if (this.producer && this.views.sourceId) {
      if (sourceId) {
        if (this.producer.screenshareStreamId) {
          this.producer.setStreamSource(sourceId, this.producer.screenshareStreamId, 'video');
        } else {
          this.producer.addStream('screenshare', sourceId);
        }
      } else {
        if (this.producer.screenshareStreamId) {
          this.producer.stopStream(this.producer.screenshareStreamId);
        }
      }
    }
  }

  /**
   * Whether the current stream has been recorded as via guest cam
   */
  streamRecorded = false;

  recordStreamAnalytics() {
    if (
      this.streamingService.views.streamingStatus === EStreamingState.Live &&
      this.state.guests.length &&
      !this.streamRecorded
    ) {
      this.usageStatisticsService.recordAnalyticsEvent('GuestCam', {
        type: 'stream',
        platforms: this.streamingService.views.enabledPlatforms,
      });
      this.streamRecorded = true;
    }
  }

  recordGuestAnalytics() {
    this.usageStatisticsService.recordAnalyticsEvent('GuestCam', {
      type: 'guestJoin',
      numGuests: this.state.guests.length,
    });
  }

  @mutation()
  private SET_PRODUCE_OK(val: boolean) {
    this.state.produceOk = val;
  }

  @mutation()
  private SET_VIDEO_SOURCE(sourceId: string) {
    this.state.videoSourceId = sourceId;
  }

  @mutation()
  private SET_AUDIO_SOURCE(sourceId: string) {
    this.state.audioSourceId = sourceId;
  }

  @mutation()
  private SET_SCREENSHARE_SOURCE(sourceId: string) {
    this.state.screenshareSourceId = sourceId;
  }

  @mutation()
  private SET_INVITE_HASH(hash: string) {
    this.state.inviteHash = hash;
  }

  @mutation()
  private ADD_GUEST(guest: IGuest) {
    this.state.guests.push(guest);
  }

  @mutation()
  private UPDATE_GUEST(streamId: string, patch: Partial<IGuest>) {
    const guest = this.state.guests.find(g => g.remoteProducer.streamId === streamId);
    Object.keys(patch).forEach(key => {
      // TODO: index
      // @ts-ignore
      Vue.set(guest, key, patch[key]);
    });
  }

  @mutation()
  private REMOVE_GUEST(streamId: string) {
    this.state.guests = this.state.guests.filter(g => g.remoteProducer.streamId !== streamId);
  }

  @mutation()
  private CLEAR_GUESTS() {
    this.state.guests = [];
  }

  @mutation()
  private SET_JOIN_AS_GUEST(inviteHash: string | null) {
    this.state.joinAsGuestHash = inviteHash;
  }

  @mutation()
  private SET_HOST_NAME(name: string) {
    this.state.hostName = name;
  }

  @mutation()
  private SET_MAX_GUESTS(maxGuests: number) {
    this.state.maxGuests = maxGuests;
  }
}
