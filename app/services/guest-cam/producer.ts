import { MediasoupEntity } from './mediasoup-entity';
import uuid from 'uuid/v4';
import { Inject } from 'services/core';
import { SourceFiltersService, SourcesService, UserService } from 'app-services';
import { GuestCamService, TConnectParams } from '.';
import { EFilterDisplayType, TSourceFilterType } from 'services/source-filters';

type TStreamType = 'camera' | 'screenshare';

interface IStream {
  id: string;
  type: TStreamType;
  videoSourceId?: string;
  audioSourceId?: string;

  // These ids are unique to a single track and are solely used for
  // associating a particular filter to a track.
  videoFilterId: string;
  audioFilterId: string;

  screenShareId?: string;
}

interface RtpEncodingParameters {
  maxBitrate: number;
  scaleResolutionDownBy: number;
}

export class Producer extends MediasoupEntity {
  @Inject() userService: UserService;
  @Inject() guestCamService: GuestCamService;
  @Inject() sourceFiltersService: SourceFiltersService;
  @Inject() sourcesService: SourcesService;

  transportId: string;

  streams: IStream[] = [];

  get cameraStreamId() {
    return this.streams.find(s => s.type === 'camera')?.id;
  }

  get screenshareStreamId() {
    return this.streams.find(s => s.type === 'screenshare')?.id;
  }

  addStream(type: TStreamType, videoSourceId?: string, audioSourceId?: string) {
    return this.withMutex(async () => {
      const videoSource = this.sourcesService.views.getSource(videoSourceId);
      const videoFilterId = uuid();
      const audioFilterId = uuid();

      const streamId = uuid();
      this.streams.push({
        id: streamId,
        type,
        videoFilterId,
        audioFilterId,
      });

      // Start by setting up filters
      if (videoSourceId) this.setStreamSource(videoSourceId, streamId, 'video');
      if (audioSourceId) this.setStreamSource(audioSourceId, streamId, 'audio');

      const result = await this.sendWebRTCRequest({
        type: 'createProducer',
        data: {
          streamId,
          type: type === 'camera' ? 'stream' : 'screenshare',
          name: this.userService.views.platform.username,
          tracks: audioSourceId ? 2 : 1,
        },
      });

      if (!this.transportId) {
        const turnConfig = await this.guestCamService.getTurnConfig();

        result['iceServers'] = [turnConfig];

        this.makeObsRequest('func_create_send_transport', result);
      }

      let encodings: RtpEncodingParameters[];

      if (videoSource) {
        encodings =
          type === 'camera'
            ? this.getCameraEncodingParameters(videoSource.height)
            : this.getScreenshareEncodingParameters(videoSource.height);
      } else {
        this.log(
          'WARNING: Video source was not available at stream creation. Simulcast was not enabled.',
        );
      }

      const videoProduceResult = this.makeObsRequest('func_create_video_producer', {
        id: videoFilterId,
        encodings,
      });
      this.log('Got Video Produce Result', videoProduceResult);

      if (!this.transportId) {
        if (!videoProduceResult.connect_params) {
          throw new Error(
            'Did not receive connect params, yet send transport is not yet connected!',
          );
        }

        await this.sendWebRTCRequest({
          type: 'connectSendTransport',
          data: videoProduceResult.connect_params,
        });

        this.log('Connected Send Transport');

        videoProduceResult.produce_params = this.makeObsRequest(
          'func_connect_result',
          'true',
        ).produce_params;

        this.transportId = videoProduceResult.produce_params.transportId;
      }

      const r = await this.sendWebRTCRequest<{ id: string }>({
        type: 'addProducerTrack',
        data: {
          streamId,
          producerTransportId: videoProduceResult.produce_params.transportId,
          kind: videoProduceResult.produce_params.kind,
          rtpParameters: videoProduceResult.produce_params.rtpParameters,
        },
      });

      if (type === 'screenshare') {
        const stream = this.streams.find(s => s.id === streamId);
        stream.screenShareId = r.id;
      }

      this.makeObsRequest('func_produce_result', 'true');

      if (audioSourceId) {
        const audioProduceParams = this.makeObsRequest('func_create_audio_producer', {
          id: audioFilterId,
        }).produce_params;

        this.log('Got Audio Produce Params', audioProduceParams);

        await this.sendWebRTCRequest({
          type: 'addProducerTrack',
          data: {
            streamId,
            producerTransportId: audioProduceParams.transportId,
            kind: audioProduceParams.kind,
            rtpParameters: audioProduceParams.rtpParameters,
          },
        });

        // Always true - it's unclear what failure looks like from server
        this.makeObsRequest('func_produce_result', 'true');
      }

      this.unlockMutex();
    });
  }

  setStreamSource(sourceId: string, streamId: string, type: 'audio' | 'video') {
    const stream = this.streams.find(s => s.id === streamId);

    // Clean up filters on existing source
    const existingSourceId = type === 'video' ? stream.videoSourceId : stream.audioSourceId;

    if (existingSourceId) {
      this.removeFiltersFromSource(existingSourceId);
    }

    // Clean up filters on new source
    this.removeFiltersFromSource(sourceId);

    this.setupFiltersOnSource(
      sourceId,
      type,
      type === 'video' ? stream.videoFilterId : stream.audioFilterId,
    );

    const key = type === 'video' ? 'videoSourceId' : 'audioSourceId';
    stream[key] = sourceId;
  }

  private setupFiltersOnSource(sourceId: string, type: 'audio' | 'video', filterId: string) {
    let filterType: TSourceFilterType = 'mediasoupconnector_afilter';
    const source = this.sourcesService.views.getSource(sourceId);

    if (!source) {
      this.log('Tried to set up filter on source that does not exist!');
      return;
    }

    if (type === 'video') {
      if (['dshow_input', 'av_capture_input'].includes(source.type)) {
        filterType = 'mediasoupconnector_vfilter';
      } else {
        filterType = 'mediasoupconnector_vsfilter';
      }
    }

    this.sourceFiltersService.add(
      sourceId,
      filterType,
      uuid(),
      { room: this.guestCamService.room, producerId: filterId },
      EFilterDisplayType.Hidden,
    );
  }

  private removeFiltersFromSource(sourceId: string) {
    // Remove all mediasoup filters
    this.sourceFiltersService.views.filtersBySourceId(sourceId, true).forEach(filter => {
      if (
        [
          'mediasoupconnector_afilter',
          'mediasoupconnector_vfilter',
          'mediasoupconnector_vsfilter',
        ].includes(filter.type)
      ) {
        this.sourceFiltersService.remove(sourceId, filter.name);
      }
    });
  }

  getCameraEncodingParameters(height: number): RtpEncodingParameters[] {
    if (height > 720) {
      return [
        { maxBitrate: 256000, scaleResolutionDownBy: 4 },
        { maxBitrate: 1200000, scaleResolutionDownBy: 2 },
        { maxBitrate: 2400000, scaleResolutionDownBy: 1 },
      ];
    }

    if (height > 480) {
      return [
        { maxBitrate: 256000, scaleResolutionDownBy: 4 },
        { maxBitrate: 512000, scaleResolutionDownBy: 2 },
        { maxBitrate: 1500000, scaleResolutionDownBy: 1 },
      ];
    }

    if (height > 360) {
      return [
        { maxBitrate: 300000, scaleResolutionDownBy: 2 },
        { maxBitrate: 600000, scaleResolutionDownBy: 1 },
        { maxBitrate: 600000, scaleResolutionDownBy: 1 },
      ];
    }

    return [
      { maxBitrate: 200000, scaleResolutionDownBy: 2 },
      { maxBitrate: 500000, scaleResolutionDownBy: 1 },
      { maxBitrate: 500000, scaleResolutionDownBy: 1 },
    ];
  }

  getScreenshareEncodingParameters(height: number): RtpEncodingParameters[] {
    if (height > 720) {
      return [{ maxBitrate: 2600000, scaleResolutionDownBy: 1 }];
    }

    if (height > 480) {
      return [{ maxBitrate: 2000000, scaleResolutionDownBy: 1 }];
    }

    if (height > 360) {
      return [{ maxBitrate: 1500000, scaleResolutionDownBy: 2 }];
    }

    return [{ maxBitrate: 1000000, scaleResolutionDownBy: 3 }];
  }

  stopStream(streamId: string) {
    const stream = this.streams.find(s => s.id === streamId);
    if (!stream) return;

    this.makeObsRequest('func_stop_producer', stream.videoFilterId);
    if (stream.audioSourceId) this.makeObsRequest('func_stop_producer', stream.audioFilterId);
    if (stream.screenShareId) {
      this.sendWebRTCRequest({
        type: 'closeProducerTrack',
        data: {
          streamId: stream.id,
          producerTransportId: this.transportId,
          trackId: stream.screenShareId,
        },
      });
    } else {
      this.sendWebRTCRequest({
        type: 'closeProducerTrack',
        data: { streamId: stream.id, producerTransportId: this.transportId },
      });
    }

    this.streams = this.streams.filter(s => s.id !== streamId);
  }

  destroy() {
    this.makeObsRequest('func_stop_sender');
    this.streams.forEach(stream => {
      this.stopStream(stream.id);
    });
    super.destroy();
  }
}
