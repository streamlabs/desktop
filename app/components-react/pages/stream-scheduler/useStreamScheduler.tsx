import cloneDeep from 'lodash/cloneDeep';
import { Services } from '../../service-provider';
import {
  FacebookService,
  IFacebookLiveVideo,
  IFacebookLiveVideoExtended,
  IFacebookStartStreamOptions,
  IFacebookUpdateVideoOptions,
  TDestinationType,
} from '../../../services/platforms/facebook';
import { FormInstance } from 'antd/lib/form';
import { getPlatformService, TPlatform } from '../../../services/platforms';
import { assertIsDefined, getDefined } from '../../../util/properties-type-guards';
import {
  IYoutubeLiveBroadcast,
  IYoutubeStartStreamOptions,
} from '../../../services/platforms/youtube';
import { message } from 'antd';
import { $t } from '../../../services/i18n';
import { IStreamError } from '../../../services/streaming/stream-error';
import { IGoLiveSettings } from '../../../services/streaming';
import styles from './StreamScheduler.m.less';
import React from 'react';
import { initStore, useController } from '../../hooks/zustand';

/**
 * Represents a single stream event
 * for displaying it in the StreamScheduler
 */
export interface IStreamEvent {
  /**
   * Event id correspond to `broadcastId` for YT
   * and to `liveVideoId` for FB
   */
  id: string;
  /**
   * The platform event belongs to
   */
  platform: TPlatform;
  /**
   * All possible event statuses are narrowed down to only 2 options
   */
  status: 'completed' | 'scheduled';
  /**
   * Stream title
   */
  title: string;
  /**
   * Scheduled date timestamp
   */
  date: number;
  /**
   * We need additional fields for FB to properly handle actions with this event
   */
  facebook?: {
    destinationType: TDestinationType;
    destinationId: string;
  };
}

/**
 * Represents settings for platforms in the StreamScheduler
 */
interface ISchedulerPlatformSettings extends Partial<Record<TPlatform, Object>> {
  youtube?: IYoutubeStartStreamOptions;
  facebook?: IFacebookStartStreamOptions;
}

export const StreamSchedulerCtx = React.createContext<StreamSchedulerController | null>(null);

/**
 * A hook for using the StreamSchedulerModule module in components
 */
export function useStreamScheduler() {
  // call `.select()` so all getters and state returned from the hook will be reactive
  return useController(StreamSchedulerCtx);
}

/**
 * A module for the StreamScheduler component
 * The module controls the components' state and provides actions
 */
export class StreamSchedulerController {
  store = initStore({
    /**
     * `true` if should show a spinner in the modal window
     */
    isLoading: false,
    /**
     * when set to `false` we show a spinner on a calendar component
     */
    isEventsLoaded: false,
    /**
     * Keep loaded events here in the unified `IStreamEvent` format
     */
    events: [] as IStreamEvent[],
    /**
     * Show the modal if `true`
     */
    isModalVisible: false,
    /**
     * Keeps the selected event id
     */
    selectedEventId: '',
    /**
     * This time will be used for creating a new event
     */
    time: 0,
    /**
     * The platform that will be selected in the modal
     */
    selectedPlatform: this.platforms[0],
    /**
     * Keep settings for the platforms here while editing
     * Fill out the default settings for each platform
     */
    platformSettings: this.defaultPlatformSettings,
    defaultPlatformSettings: this.defaultPlatformSettings,
  });

  /**
   * Load all events into state on module init
   */
  init() {
    this.loadEvents();
  }

  /**
   * Returns default settings for prepopulating input fields in the Modal
   */
  get defaultPlatformSettings(): ISchedulerPlatformSettings {
    const defaultSettings = {
      facebook: cloneDeep(Services.FacebookService.state.settings) as IFacebookUpdateVideoOptions,
      youtube: cloneDeep(Services.YoutubeService.state.settings),
    };
    defaultSettings.youtube.broadcastId = '';
    defaultSettings.facebook.liveVideoId = '';
    return defaultSettings;
  }

  // antd form instance
  public form: FormInstance;

  /**
   * The modal component should set the form
   * so we can use the `submit` action in the module
   */
  setForm(form: FormInstance) {
    this.form = form;
  }

  get streamingView() {
    return Services.StreamingService.views;
  }

  get selectedEvent() {
    return this.store.events.find(ev => this.store.selectedEventId === ev.id);
  }

  /**
   * Prepopulates platforms and loads FB and YT events
   */
  private async loadEvents() {
    this.reset();
    // load fb and yt events simultaneously
    // @ts-ignore typescript upgrade
    const [fbEvents, ytEvents] = await Promise.all([this.fetchFbEvents(), this.fetchYTBEvents()]);
    // @ts-ignore typescript upgrade
    this.setEvents([...fbEvents, ...ytEvents]);
  }

  private async fetchYTBEvents() {
    if (!this.platforms.includes('youtube')) return [];
    const ytActions = Services.YoutubeService.actions;
    try {
      await ytActions.return.prepopulateInfo();
      const broadcasts = await ytActions.return.fetchBroadcasts();
      return broadcasts.map(broadcast => convertYTBroadcastToEvent(broadcast));
    } catch (e: unknown) {
      message.error({
        content: $t('Failed to load YouTube events'),
        className: styles.schedulerError,
      });
      return [];
    }
  }

  private async fetchFbEvents() {
    if (!this.platforms.includes('facebook')) return [];
    const fbActions = Services.FacebookService.actions;
    try {
      await fbActions.return.prepopulateInfo();
      const liveVideos = await fbActions.return.fetchAllVideos();
      return liveVideos.map(video => convertFBLiveVideoToEvent(video));
    } catch (e: unknown) {
      message.error({
        content: $t('Failed to load Facebook events'),
        className: styles.schedulerError,
      });
      return [];
    }
  }

  /**
   * Returns linked platforms that support scheduling
   */
  get platforms(): TPlatform[] {
    return this.streamingView.linkedPlatforms.filter(platform =>
      this.streamingView.supports('stream-schedule', [platform]),
    );
  }

  get isUpdateMode() {
    return !!this.store.selectedEventId;
  }

  get fbSettings(): IFacebookStartStreamOptions {
    return getDefined(this.store.platformSettings.facebook);
  }

  get ytSettings(): IYoutubeStartStreamOptions {
    return getDefined(this.store.platformSettings.youtube);
  }

  get primaryPlatform() {
    return getDefined(Services.UserService.views.platform).type;
  }

  getPlatformDisplayName = this.streamingView.getPlatformDisplayName;

  private recordFeatureUsage(
    featureName: 'StreamSchedulerView' | 'StreamSchedulerEdit' | 'StreamSchedulerGoLive',
  ) {
    Services.UsageStatisticsService.actions.recordFeatureUsage(featureName);
  }

  /**
   * Shows a modal for creating a new event
   */
  showNewEventModal(platform: TPlatform, selectedTime?: number) {
    const today = new Date().setHours(0, 0, 0, 0);
    const time = selectedTime || this.store.time;
    const isPastDate = time < today;
    if (isPastDate) {
      message.error({
        content: $t('You can not schedule to a past date'),
        className: styles.schedulerError,
      });
      return;
    }
    this.store.setState(s => {
      s.selectedPlatform = platform;
      s.isModalVisible = true;
    });
    this.setTime(time.valueOf());
  }

  /**
   * Shows a modal for editing an existing event
   */
  async showEditEventModal(eventId: string) {
    this.recordFeatureUsage('StreamSchedulerView');
    const event = getDefined(this.store.events.find(ev => eventId === ev.id));
    if (event.platform === 'youtube') {
      const ytSettings = await Services.YoutubeService.actions.return.fetchStartStreamOptionsForBroadcast(
        event.id,
      );
      this.SHOW_EDIT_EVENT_MODAL(event, ytSettings);
    } else {
      const fbDestination = getDefined(event.facebook);
      const fbSettings = await Services.FacebookService.actions.return.fetchStartStreamOptionsForVideo(
        event.id,
        fbDestination.destinationType,
        fbDestination.destinationId,
      );
      this.SHOW_EDIT_EVENT_MODAL(event, fbSettings);
    }
  }

  /**
   * Validates and submits the event editor form
   */
  async submit(): Promise<boolean> {
    this.recordFeatureUsage('StreamSchedulerEdit');
    // validate form
    try {
      await this.form.validateFields();
    } catch (e: unknown) {
      message.error({
        content: $t('Invalid settings. Please check the form'),
        className: styles.schedulerError,
      });
      return false;
    }

    this.showLoader();
    if (this.isUpdateMode) {
      await this.saveExistingEvent();
    } else {
      await this.saveNewEvent();
    }
    return true;
  }

  /**
   * Saves the existing event via platform's API
   */
  private async saveExistingEvent() {
    const { selectedPlatform, selectedEventId } = this.store;
    const streamSettings = getDefined(this.store.platformSettings[selectedPlatform]);

    if (selectedPlatform === 'youtube') {
      // update YT event
      const ytSettings = cloneDeep(streamSettings) as IYoutubeStartStreamOptions;
      ytSettings.scheduledStartTime = this.store.time;
      const video = await Services.YoutubeService.actions.return.updateBroadcast(
        selectedEventId,
        ytSettings,
      );
      this.setEvent(video.id, convertYTBroadcastToEvent(video));
    } else {
      // update FB event
      const event = getDefined(this.selectedEvent);
      const fbOptions = getDefined(event.facebook);
      let video!: IFacebookLiveVideo;
      try {
        video = await Services.FacebookService.actions.return.updateLiveVideo(
          selectedEventId,
          streamSettings as IFacebookUpdateVideoOptions,
        );
      } catch (e: unknown) {
        this.handleError(e as IStreamError);
        return;
      }
      this.setEvent(video.id, convertFBLiveVideoToEvent({ ...video, ...fbOptions }));
      Services.UsageStatisticsService.actions.recordAnalyticsEvent('ScheduleStream', {
        type: 'EditStream',
        platform: selectedPlatform,
        streamId: video.id,
      });
    }
    this.closeModal();
  }

  /**
   * Create a new event via platform's API
   */
  private async saveNewEvent() {
    const { selectedPlatform, time } = this.store;
    const streamSettings = getDefined(this.store.platformSettings[selectedPlatform]);
    const service = getPlatformService(selectedPlatform);

    assertIsDefined(service.scheduleStream);
    let video!: IFacebookLiveVideo | IYoutubeLiveBroadcast;
    try {
      video = await service.scheduleStream(time, streamSettings);
    } catch (e: unknown) {
      this.handleError(e as IStreamError);
      return;
    }
    let event: IStreamEvent;
    if (selectedPlatform === 'youtube') {
      event = convertYTBroadcastToEvent(video as IYoutubeLiveBroadcast);
    } else {
      assertIsDefined(this.fbSettings);
      const fbSettings = getDefined(this.fbSettings);
      const destinationId = (service as FacebookService).views.getDestinationId(fbSettings);
      event = convertFBLiveVideoToEvent({
        ...video,
        destinationType: fbSettings.destinationType,
        destinationId,
      } as IFacebookLiveVideoExtended);
    }
    this.addEvent(event);
    Services.UsageStatisticsService.actions.recordAnalyticsEvent('ScheduleStream', {
      type: 'NewStream',
      platform: selectedPlatform,
      streamId: event.id,
    });
    this.closeModal();
  }

  /**
   * Handles errors from the platform's API
   */
  private handleError(err: IStreamError) {
    if (this.store.selectedPlatform === 'facebook') {
      message.error({
        content: $t(
          'Please schedule no further than 7 days in advance and no sooner than 10 minutes in advance.',
        ),
        className: styles.schedulerError,
      });
    } else {
      message.error({
        content: $t('Can not schedule the stream for the given date/time'),
        className: styles.schedulerError,
      });
    }
    this.hideLoader();
  }

  /**
   * Start stream to a selected event
   */
  async goLive() {
    this.recordFeatureUsage('StreamSchedulerGoLive');
    const event = getDefined(this.selectedEvent);
    const prepopulateOptions = {
      [event.platform]: this.store.platformSettings[event.platform],
    } as IGoLiveSettings['prepopulateOptions'];

    // save the form
    if (!(await this.submit())) return;

    // open the GoLiveWindow
    await Services.StreamingService.actions.showGoLiveWindow(prepopulateOptions);
  }

  /**
   * Removes the event via platform's API
   * also deletes it from the module's state
   */
  remove() {
    const { selectedPlatform, selectedEventId } = this.store;
    this.showLoader();
    if (selectedPlatform === 'youtube') {
      Services.YoutubeService.actions.return.removeBroadcast(selectedEventId);
    } else {
      const event = getDefined(this.selectedEvent);
      const fbOptions = getDefined(event.facebook);
      Services.FacebookService.actions.return.removeLiveVideo(selectedEventId, fbOptions);
    }
    this.REMOVE_EVENT(selectedEventId);
    this.closeModal();
  }

  private SHOW_EDIT_EVENT_MODAL(
    event: IStreamEvent,
    platformSettings: IYoutubeStartStreamOptions | IFacebookStartStreamOptions,
  ) {
    this.store.setState(s => {
      s.selectedEventId = event.id;
      s.selectedPlatform = event.platform;
      s.platformSettings[event.platform] = platformSettings as any;
      s.isModalVisible = true;
      s.time = event.date;
    });
  }

  closeModal() {
    this.store.setState(s => {
      s.selectedEventId = '';
      s.isModalVisible = false;
      s.platformSettings = this.defaultPlatformSettings;
      s.isLoading = false;
    });
  }

  updatePlatform<T extends TPlatform>(platform: T, patch: ISchedulerPlatformSettings[T]) {
    this.store.setState(s => {
      //@ts-ignore typescript upgrade
      Object.assign(s.platformSettings[platform], patch);
    });
  }

  setTime(time: number) {
    this.store.setState(s => {
      s.time = time;
      if (s.selectedPlatform === 'facebook') {
        getDefined(s.platformSettings.facebook).event_params.start_time = time;
      } else {
        getDefined(s.platformSettings.youtube).scheduledStartTime = time;
      }
    });
  }

  private reset() {
    this.store.setState(s => {
      s.events = [];
      s.platformSettings = this.defaultPlatformSettings;
    });
  }

  private setEvents(events: IStreamEvent[]) {
    this.store.setState(s => {
      s.isEventsLoaded = true;
      s.events = events;
    });
  }

  private addEvent(event: IStreamEvent) {
    this.store.setState(s => {
      s.events.push(event);
    });
  }

  private setEvent(id: string, event: IStreamEvent) {
    this.store.setState(s => {
      const ind = s.events.findIndex(ev => ev.id === id);
      s.events.splice(ind, 1, event);
    });
  }

  private REMOVE_EVENT(id: string) {
    this.store.setState(s => {
      s.events = s.events.filter(ev => ev.id !== id);
    });
  }

  /**
   * Shows a spinner in the modal window
   */
  private showLoader() {
    this.store.setState(s => {
      s.isLoading = true;
    });
  }

  /**
   * Shows a spinner in the modal window
   */
  private hideLoader() {
    this.store.setState(s => {
      s.isLoading = false;
    });
  }
}

/**
 * Converts YT broadcast to IStreamEvent
 */
function convertYTBroadcastToEvent(ytBroadcast: IYoutubeLiveBroadcast): IStreamEvent {
  let status: IStreamEvent['status'] = 'completed';
  if (
    ytBroadcast.status.lifeCycleStatus === 'created' ||
    ytBroadcast.status.lifeCycleStatus === 'ready'
  ) {
    status = 'scheduled';
  }

  return {
    platform: 'youtube',
    id: ytBroadcast.id,
    date: new Date(
      ytBroadcast.snippet.scheduledStartTime || ytBroadcast.snippet.actualStartTime,
    ).valueOf(),
    title: ytBroadcast.snippet.title,
    status,
  };
}

/**
 * Converts FB liveVideo to IStreamEvent
 */
function convertFBLiveVideoToEvent(fbLiveVideo: IFacebookLiveVideoExtended): IStreamEvent {
  // Videos "just" created don't seem to have `broadcast_start_time`, fallback to planned.
  const date = fbLiveVideo.broadcast_start_time || fbLiveVideo.planned_start_time;
  assertIsDefined(date);

  return {
    platform: 'facebook',
    id: fbLiveVideo.id,
    date: new Date(date).valueOf(),
    title: fbLiveVideo.title,
    status: 'scheduled',
    facebook: {
      destinationType: fbLiveVideo.destinationType,
      destinationId: fbLiveVideo.destinationId,
    },
  };
}
