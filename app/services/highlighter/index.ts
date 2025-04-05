import { mutation, Inject, InitAfter, Service, PersistentStatefulService } from 'services/core';
import path from 'path';
import Vue from 'vue';
import fs from 'fs-extra';
import * as remote from '@electron/remote';
import { EStreamingState, StreamingService } from 'services/streaming';
import { getPlatformService } from 'services/platforms';
import { UserService } from 'services/user';
import {
  IYoutubeVideoUploadOptions,
  IYoutubeUploadResponse,
} from 'services/platforms/youtube/uploader';
import { YoutubeService } from 'services/platforms/youtube';
import os from 'os';
import { SCRUB_SPRITE_DIRECTORY, SUPPORTED_FILE_TYPES } from './constants';
import { pmap } from 'util/pmap';
import { RenderingClip } from './rendering/rendering-clip';
import { throttle } from 'lodash-decorators';
import * as Sentry from '@sentry/browser';
import { TAnalyticsEvent, UsageStatisticsService } from 'services/usage-statistics';

import { $t } from 'services/i18n';
import { DismissablesService, EDismissable } from 'services/dismissables';
import { ENotificationType, NotificationsService } from 'services/notifications';
import { JsonrpcService } from 'services/api/jsonrpc';
import { NavigationService } from 'services/navigation';
import { SharedStorageService } from 'services/integrations/shared-storage';
import moment from 'moment';
import uuid from 'uuid';
import { EMenuItemKey } from 'services/side-nav';
import { AiHighlighterUpdater } from './ai-highlighter-updater';
import { IDownloadProgress } from 'util/requests';
import { IncrementalRolloutService } from 'app-services';

import { EAvailableFeatures } from 'services/incremental-rollout';
import {
  IAiClip,
  IHighlightedStream,
  IHighlighterState,
  INewClipData,
  isAiClip,
  IStreamInfoForAiHighlighter,
  IStreamMilestones,
  IUploadInfo,
  TClip,
  TStreamInfo,
} from './models/highlighter.models';
import {
  EExportStep,
  IAudioInfo,
  IExportInfo,
  IExportOptions,
  ITransitionInfo,
  IVideoInfo,
  TFPS,
  TPreset,
  TResolution,
} from './models/rendering.models';
import { ProgressTracker, getHighlightClips } from './ai-highlighter-utils';
import {
  EAiDetectionState,
  TOrientation,
  ICoordinates,
  IHighlight,
  IHighlighterMilestone,
  IInput,
  EOrientation,
  EGame,
} from './models/ai-highlighter.models';
import { HighlighterViews } from './highlighter-views';
import { startRendering } from './rendering/start-rendering';
import { cutHighlightClips, getVideoDuration } from './cut-highlight-clips';
import { reduce } from 'lodash';
import { extractDateTimeFromPath, fileExists } from './file-utils';
import { addVerticalFilterToExportOptions } from './vertical-export';

@InitAfter('StreamingService')
export class HighlighterService extends PersistentStatefulService<IHighlighterState> {
  @Inject() streamingService: StreamingService;
  @Inject() userService: UserService;
  @Inject() usageStatisticsService: UsageStatisticsService;
  @Inject() dismissablesService: DismissablesService;
  @Inject() notificationsService: NotificationsService;
  @Inject() jsonrpcService: JsonrpcService;
  @Inject() navigationService: NavigationService;
  @Inject() sharedStorageService: SharedStorageService;
  @Inject() incrementalRolloutService: IncrementalRolloutService;

  static defaultState: IHighlighterState = {
    clips: {},
    transition: {
      type: 'fade',
      duration: 1,
    },
    video: {
      intro: { path: '', duration: null },
      outro: { path: '', duration: null },
    },
    audio: {
      musicEnabled: false,
      musicPath: '',
      musicVolume: 50,
    },
    export: {
      exporting: false,
      currentFrame: 0,
      totalFrames: 0,
      step: EExportStep.AudioMix,
      cancelRequested: false,
      file: '',
      previewFile: path.join(os.tmpdir(), 'highlighter-preview.mp4'),
      exported: false,
      error: null,
      fps: 30,
      resolution: 1080,
      preset: 'fast',
    },
    upload: {
      uploading: false,
      uploadedBytes: 0,
      totalBytes: 0,
      cancelRequested: false,
      videoId: null,
      error: false,
    },
    dismissedTutorial: false,
    error: '',
    useAiHighlighter: false,
    highlightedStreams: [],
    updaterProgress: 0,
    isUpdaterRunning: false,
    highlighterVersion: '',
  };

  aiHighlighterUpdater: AiHighlighterUpdater;
  aiHighlighterFeatureEnabled = false;
  streamMilestones: IStreamMilestones | null = null;

  static filter(state: IHighlighterState) {
    return {
      ...this.defaultState,
      clips: state.clips,
      highlightedStreams: state.highlightedStreams,
      video: state.video,
      audio: state.audio,
      transition: state.transition,
      useAiHighlighter: state.useAiHighlighter,
      highlighterVersion: state.highlighterVersion,
    };
  }

  /**
   * A dictionary of actual clip classes.
   * These are not serializable so kept out of state.
   */
  renderingClips: Dictionary<RenderingClip> = {};
  directoryCleared = false;

  @mutation()
  ADD_CLIP(clip: TClip) {
    Vue.set(this.state.clips, clip.path, clip);
    this.state.export.exported = false;
  }

  @mutation()
  UPDATE_CLIP(clip: Partial<TClip> & { path: string }) {
    Vue.set(this.state.clips, clip.path, {
      ...this.state.clips[clip.path],
      ...clip,
    });
    this.state.export.exported = false;
  }

  @mutation()
  REMOVE_CLIP(clipPath: string) {
    Vue.delete(this.state.clips, clipPath);
    this.state.export.exported = false;
  }

  @mutation()
  SET_EXPORT_INFO(exportInfo: Partial<IExportInfo>) {
    this.state.export = {
      ...this.state.export,
      exported: false,
      ...exportInfo,
    };
  }

  @mutation()
  SET_UPLOAD_INFO(uploadInfo: Partial<IUploadInfo>) {
    this.state.upload = {
      ...this.state.upload,
      ...uploadInfo,
    };
  }

  @mutation()
  CLEAR_UPLOAD() {
    this.state.upload = {
      uploading: false,
      uploadedBytes: 0,
      totalBytes: 0,
      cancelRequested: false,
      videoId: null,
      error: false,
    };
  }

  @mutation()
  SET_TRANSITION_INFO(transitionInfo: Partial<ITransitionInfo>) {
    this.state.transition = {
      ...this.state.transition,
      ...transitionInfo,
    };
    this.state.export.exported = false;
  }

  @mutation()
  SET_AUDIO_INFO(audioInfo: Partial<IAudioInfo>) {
    this.state.audio = {
      ...this.state.audio,
      ...audioInfo,
    };
    this.state.export.exported = false;
  }

  @mutation()
  SET_VIDEO_INFO(videoInfo: Partial<IVideoInfo>) {
    this.state.video = {
      ...this.state.video,
      ...videoInfo,
    };
    this.state.export.exported = false;
  }

  @mutation()
  DISMISS_TUTORIAL() {
    this.state.dismissedTutorial = true;
  }

  @mutation()
  SET_ERROR(error: string) {
    this.state.error = error;
  }

  @mutation()
  SET_USE_AI_HIGHLIGHTER(useAiHighlighter: boolean) {
    Vue.set(this.state, 'useAiHighlighter', useAiHighlighter);
    this.state.useAiHighlighter = useAiHighlighter;
  }

  @mutation()
  ADD_HIGHLIGHTED_STREAM(streamInfo: IHighlightedStream) {
    // Vue.set(this.state, 'highlightedStreams', streamInfo);
    this.state.highlightedStreams.push(streamInfo);
  }

  @mutation()
  UPDATE_HIGHLIGHTED_STREAM(updatedStreamInfo: IHighlightedStream) {
    const keepAsIs = this.state.highlightedStreams.filter(
      stream => stream.id !== updatedStreamInfo.id,
    );
    this.state.highlightedStreams = [...keepAsIs, updatedStreamInfo];
  }

  @mutation()
  REMOVE_HIGHLIGHTED_STREAM(id: string) {
    this.state.highlightedStreams = this.state.highlightedStreams.filter(
      stream => stream.id !== id,
    );
  }

  @mutation()
  SET_UPDATER_PROGRESS(progress: number) {
    this.state.updaterProgress = progress;
  }

  @mutation()
  SET_UPDATER_STATE(isRunning: boolean) {
    this.state.isUpdaterRunning = isRunning;
  }

  @mutation()
  SET_HIGHLIGHTER_VERSION(version: string) {
    this.state.highlighterVersion = version;
  }

  get views() {
    return new HighlighterViews(this.state);
  }

  async init() {
    super.init();

    this.incrementalRolloutService.featuresReady.then(async () => {
      this.aiHighlighterFeatureEnabled = this.incrementalRolloutService.views.featureIsEnabled(
        EAvailableFeatures.aiHighlighter,
      );

      if (this.aiHighlighterFeatureEnabled && !this.aiHighlighterUpdater) {
        this.aiHighlighterUpdater = new AiHighlighterUpdater();
      }
    });

    //
    this.views.clips.forEach(clip => {
      if (isAiClip(clip) && (clip.aiInfo as any).moments) {
        clip.aiInfo.inputs = (clip.aiInfo as any).moments;
        delete (clip.aiInfo as any).moments;
      }
    });

    //Check if files are existent, if not, delete
    this.views.clips.forEach(c => {
      if (!fileExists(c.path)) {
        this.removeClip(c.path, undefined);
      }
    });

    if (this.views.exportInfo.exporting) {
      this.SET_EXPORT_INFO({
        exporting: false,
        error: null,
        cancelRequested: false,
      });
    }

    //Check if aiDetections were still running when the user closed desktop
    this.views.highlightedStreams
      .filter(stream => stream.state.type === 'detection-in-progress')
      .forEach(stream => {
        this.UPDATE_HIGHLIGHTED_STREAM({
          ...stream,
          state: { type: EAiDetectionState.CANCELED_BY_USER, progress: 0 },
        });
      });

    this.views.clips.forEach(c => {
      this.UPDATE_CLIP({
        path: c.path,
        loaded: false,
      });
    });

    try {
      // On some very very small number of systems, we won't be able to fetch
      // the videos path from the system.
      // TODO: Add a fallback directory?
      this.SET_EXPORT_INFO({
        file: path.join(remote.app.getPath('videos'), 'Output.mp4'),
      });
    } catch (e: unknown) {
      console.error('Got error fetching videos directory', e);
    }

    this.handleStreamingChanges();
  }

  private handleStreamingChanges() {
    let aiRecordingStartTime = moment();
    let streamInfo: IStreamInfoForAiHighlighter;
    let streamStarted = false;
    let aiRecordingInProgress = false;

    this.streamingService.replayBufferFileWrite.subscribe(async clipPath => {
      const streamId = streamInfo?.id || undefined;
      let endTime: number | undefined;

      if (streamId) {
        endTime = moment().diff(aiRecordingStartTime, 'seconds');
      } else {
        endTime = undefined;
      }

      const REPLAY_BUFFER_DURATION = 20; // TODO M: Replace with settingsservice
      const startTime = Math.max(0, endTime ? endTime - REPLAY_BUFFER_DURATION : 0);

      this.addClips([{ path: clipPath, startTime, endTime }], streamId, 'ReplayBuffer');
    });

    this.streamingService.streamingStatusChange.subscribe(async status => {
      if (status === EStreamingState.Live) {
        streamStarted = true; // console.log('live', this.streamingService.views.settings.platforms.twitch.title);

        if (!this.aiHighlighterFeatureEnabled) {
          return;
        }

        if (this.views.useAiHighlighter === false) {
          console.log('HighlighterService: Game:', this.streamingService.views.game);
          // console.log('Highlighter not enabled or not Fortnite');
          return;
        }

        // console.log('recording Alreadyt running?:', this.streamingService.views.isRecording);
        this.usageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
          type: 'AiRecordingStarted',
        });

        if (this.streamingService.views.isRecording) {
          // console.log('Recording is already running');
        } else {
          this.streamingService.actions.toggleRecording();
        }

        let game = EGame.UNSET;
        switch (this.streamingService.views.game) {
          case EGame.FORTNITE:
            game = EGame.FORTNITE;
            break;

          default:
            game = EGame.UNSET;
            break;
        }

        streamInfo = {
          id: 'fromStreamRecording' + uuid(),
          title: this.streamingService.views.settings.platforms.twitch?.title,
          game,
        };
        aiRecordingInProgress = true;
        aiRecordingStartTime = moment();
      }

      if (status === EStreamingState.Offline) {
        if (
          streamStarted &&
          this.views.clips.length > 0 &&
          this.dismissablesService.views.shouldShow(EDismissable.HighlighterNotification)
        ) {
          this.notificationsService.push({
            type: ENotificationType.SUCCESS,
            lifeTime: -1,
            message: $t(
              'Edit your replays with Highlighter, a free editor built in to Streamlabs.',
            ),
            action: this.jsonrpcService.createRequest(
              Service.getResourceId(this),
              'notificationAction',
            ),
          });

          this.usageStatisticsService.recordAnalyticsEvent(
            this.views.useAiHighlighter ? 'AIHighlighter' : 'Highlighter',
            {
              type: 'NotificationShow',
            },
          );
        }

        streamStarted = false;
      }
      if (status === EStreamingState.Ending) {
        if (!aiRecordingInProgress) {
          return;
        }

        this.usageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
          type: 'AiRecordingFinished',
        });
        this.streamingService.actions.toggleRecording();

        // Load potential replaybuffer clips
        await this.loadClips(streamInfo.id);
      }
    });

    this.streamingService.latestRecordingPath.subscribe(path => {
      if (!aiRecordingInProgress) {
        return;
      }
      // Check if recording is immediately available
      getVideoDuration(path)
        .then(duration => {
          if (isNaN(duration)) {
            duration = -1;
          }
          this.usageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
            type: 'AiRecordingExists',
            duration,
          });
        })
        .catch(error => {
          console.error('Failed getting duration right after the recoding.', error);
        });

      aiRecordingInProgress = false;
      this.detectAndClipAiHighlights(path, streamInfo, true);

      this.navigationService.actions.navigate(
        'Highlighter',
        { view: 'stream' },
        EMenuItemKey.Highlighter,
      );
    });
  }

  notificationAction() {
    this.navigationService.navigate('Highlighter');
    this.dismissablesService.dismiss(EDismissable.HighlighterNotification);
    this.usageStatisticsService.recordAnalyticsEvent(
      this.views.useAiHighlighter ? 'AIHighlighter' : 'Highlighter',
      {
        type: 'NotificationClick',
      },
    );
  }

  setTransition(transition: Partial<ITransitionInfo>) {
    this.SET_TRANSITION_INFO(transition);
  }

  setAudio(audio: Partial<IAudioInfo>) {
    this.SET_AUDIO_INFO(audio);
  }

  setVideo(video: Partial<IVideoInfo>) {
    this.SET_VIDEO_INFO(video);
  }

  resetExportedState() {
    this.SET_EXPORT_INFO({ exported: false });
  }
  setExportFile(file: string) {
    this.SET_EXPORT_INFO({ file });
  }

  setFps(fps: TFPS) {
    this.SET_EXPORT_INFO({ fps });
  }

  setResolution(resolution: TResolution) {
    this.SET_EXPORT_INFO({ resolution });
  }

  setPreset(preset: TPreset) {
    this.SET_EXPORT_INFO({ preset });
  }

  dismissError() {
    if (this.state.export.error) this.SET_EXPORT_INFO({ error: null });
    if (this.state.upload.error) this.SET_UPLOAD_INFO({ error: false });
    if (this.state.error) this.SET_ERROR('');
  }

  dismissTutorial() {
    this.DISMISS_TUTORIAL();
  }

  // =================================================================================================
  // CLIPS logic
  // =================================================================================================
  addClips(
    newClips: { path: string; startTime?: number; endTime?: number }[],
    streamId: string | undefined,
    source: 'Manual' | 'ReplayBuffer',
  ) {
    newClips.forEach((clipData, index) => {
      const currentClips = this.getClips(this.views.clips, streamId);
      const allClips = this.getClips(this.views.clips, undefined);
      const getHighestGlobalOrderPosition = allClips.length;

      let newStreamInfo: { [key: string]: TStreamInfo } = {};
      if (source === 'Manual') {
        if (streamId) {
          currentClips.forEach(clip => {
            if (clip?.streamInfo?.[streamId] === undefined) {
              return;
            }

            const updatedStreamInfo = {
              ...clip.streamInfo,
              [streamId]: {
                ...clip.streamInfo[streamId],
                orderPosition: clip.streamInfo[streamId]!.orderPosition + 1,
              },
            };
            // update streaminfo position
            this.UPDATE_CLIP({
              path: clip.path,
              streamInfo: updatedStreamInfo,
            });
          });

          // Update globalOrderPosition of all other items as well
          allClips.forEach(clip => {
            this.UPDATE_CLIP({
              path: clip.path,
              globalOrderPosition: clip.globalOrderPosition + 1,
            });
          });

          newStreamInfo = {
            [streamId]: {
              orderPosition: 0 + index,
            },
          };
        } else {
          // If no streamId currentCLips = allClips
          currentClips.forEach(clip => {
            this.UPDATE_CLIP({
              path: clip.path,
              globalOrderPosition: clip.globalOrderPosition + 1,
            });
          });
        }
      } else {
        if (streamId) {
          newStreamInfo = {
            [streamId]: {
              orderPosition: index + currentClips.length + 1,
              initialStartTime: clipData.startTime,
              initialEndTime: clipData.endTime,
            },
          };
        }
      }

      if (this.state.clips[clipData.path]) {
        //Add new newStreamInfo, wont be added if no streamId is available
        const updatedStreamInfo = {
          ...this.state.clips[clipData.path].streamInfo,
          ...newStreamInfo,
        };

        this.UPDATE_CLIP({
          path: clipData.path,
          streamInfo: updatedStreamInfo,
        });
        return;
      } else {
        this.ADD_CLIP({
          path: clipData.path,
          loaded: false,
          enabled: true,
          startTrim: 0,
          endTrim: 0,
          deleted: false,
          source,

          // Manual clips always get prepended to be visible after adding them
          // ReplayBuffers will appended to have them in the correct order.
          globalOrderPosition:
            source === 'Manual' ? 0 + index : index + getHighestGlobalOrderPosition + 1,
          streamInfo: streamId !== undefined ? newStreamInfo : undefined,
        });
      }
    });
    return;
  }

  async addAiClips(newClips: INewClipData[], newStreamInfo: IStreamInfoForAiHighlighter) {
    const currentHighestOrderPosition = this.getClips(this.views.clips, newStreamInfo.id).length;
    const getHighestGlobalOrderPosition = this.getClips(this.views.clips, undefined).length;

    newClips.forEach((clip, index) => {
      // Don't allow adding the same clip twice for ai clips
      if (this.state.clips[clip.path]) return;

      const streamInfo: { [key: string]: TStreamInfo } = {
        [newStreamInfo.id]: {
          // Orderposition will get overwritten by sortStreamClipsByStartTime after creation
          orderPosition:
            index + currentHighestOrderPosition + (currentHighestOrderPosition === 0 ? 0 : 1),
          initialStartTime: clip.startTime,
          initialEndTime: clip.endTime,
        },
      };

      this.ADD_CLIP({
        path: clip.path,
        loaded: false,
        enabled: true,
        startTrim: clip.startTrim,
        endTrim: clip.endTrim,
        deleted: false,
        source: 'AiClip',
        aiInfo: clip.aiClipInfo,
        globalOrderPosition:
          index + getHighestGlobalOrderPosition + (getHighestGlobalOrderPosition === 0 ? 0 : 1),
        streamInfo,
      });
    });
    this.sortStreamClipsByStartTime(this.views.clips, newStreamInfo);
    await this.loadClips(newStreamInfo.id);
  }

  // This sorts all clips (replayBuffer and aiClips) by initialStartTime
  // That will assure that replayBuffer clips are also sorted in correctly in the stream
  sortStreamClipsByStartTime(clips: TClip[], newStreamInfo: IStreamInfoForAiHighlighter) {
    const allClips = this.getClips(clips, newStreamInfo.id);

    const sortedClips = allClips.sort(
      (a, b) =>
        (a.streamInfo?.[newStreamInfo.id]?.initialStartTime || 0) -
        (b.streamInfo?.[newStreamInfo.id]?.initialStartTime || 0),
    );

    // Update order positions based on the sorted order
    sortedClips.forEach((clip, index) => {
      this.UPDATE_CLIP({
        path: clip.path,
        streamInfo: {
          [newStreamInfo.id]: {
            ...(clip.streamInfo?.[newStreamInfo.id] ?? {}),
            orderPosition: index,
          },
        },
      });
    });
    return;
  }

  getGameByStreamId(streamId?: string): EGame {
    if (!streamId) return EGame.UNSET;

    const game = this.views.highlightedStreams.find(s => s.id === streamId)?.game;
    if (!game) return EGame.UNSET;

    const lowercaseGame = game.toLowerCase();
    // Check if it is supported game (important for older states of highlighter)
    if (Object.values(EGame).includes(lowercaseGame as EGame)) {
      return game as EGame;
    }

    return EGame.UNSET;
  }

  enableClip(path: string, enabled: boolean) {
    this.UPDATE_CLIP({
      path,
      enabled,
    });
  }
  disableClip(path: string) {
    this.UPDATE_CLIP({
      path,
      enabled: false,
    });
  }

  setStartTrim(path: string, trim: number) {
    this.UPDATE_CLIP({
      path,
      startTrim: trim,
    });
  }

  setEndTrim(path: string, trim: number) {
    this.UPDATE_CLIP({
      path,
      endTrim: trim,
    });
  }

  removeClip(path: string, streamId: string | undefined) {
    const clip: TClip = this.state.clips[path];
    if (!clip) {
      console.warn(`Clip not found for path: ${path}`);
      return;
    }
    if (
      fileExists(path) &&
      streamId &&
      clip.streamInfo &&
      Object.keys(clip.streamInfo).length > 1
    ) {
      const updatedStreamInfo = { ...clip.streamInfo };
      delete updatedStreamInfo[streamId];

      this.UPDATE_CLIP({
        path: clip.path,
        streamInfo: updatedStreamInfo,
      });
    } else {
      this.REMOVE_CLIP(path);
      this.removeScrubFile(clip.scrubSprite);
      delete this.renderingClips[path];
    }

    if (clip.streamInfo !== undefined || streamId !== undefined) {
      // if we are passing a streamId, only check if we need to remove the specific streamIds stream
      // If we are not passing a streamId, check if we need to remove the streams the clip was part of
      const ids: string[] = streamId ? [streamId] : Object.keys(clip.streamInfo ?? {});
      const length = this.views.clips.length;

      ids.forEach(id => {
        let found = false;
        if (length !== 0) {
          for (let i = 0; i < length; i++) {
            if (this.views.clips[i].streamInfo?.[id] !== undefined) {
              found = true;
              break;
            }
          }
        }
        if (!found) {
          this.REMOVE_HIGHLIGHTED_STREAM(id);
        }
      });
    }
  }

  async loadClips(streamInfoId?: string | undefined) {
    const clipsToLoad: TClip[] = this.getClips(this.views.clips, streamInfoId);
    // this.resetRenderingClips();
    await this.ensureScrubDirectory();

    for (const clip of clipsToLoad) {
      if (!fileExists(clip.path)) {
        this.removeClip(clip.path, streamInfoId);
        return;
      }

      if (!SUPPORTED_FILE_TYPES.map(e => `.${e}`).includes(path.parse(clip.path).ext)) {
        this.removeClip(clip.path, streamInfoId);
        this.SET_ERROR(
          $t(
            'One or more clips could not be imported because they were not recorded in a supported file format.',
          ),
        );
      }

      this.renderingClips[clip.path] =
        this.renderingClips[clip.path] ?? new RenderingClip(clip.path);
    }

    //TODO M: tracking type not correct
    await pmap(
      clipsToLoad.filter(c => !c.loaded),
      c => this.renderingClips[c.path].init(),
      {
        concurrency: os.cpus().length,
        onProgress: completed => {
          this.usageStatisticsService.recordAnalyticsEvent(
            this.views.useAiHighlighter ? 'AIHighlighter' : 'Highlighter',
            {
              type: 'ClipImport',
              source: completed.source,
            },
          );
          this.UPDATE_CLIP({
            path: completed.path,
            loaded: true,
            scrubSprite: this.renderingClips[completed.path].frameSource?.scrubJpg,
            duration: this.renderingClips[completed.path].duration,
            deleted: this.renderingClips[completed.path].deleted,
          });
        },
      },
    );
    return;
  }

  getClips(clips: TClip[], streamId?: string): TClip[] {
    return clips.filter(clip => {
      if (clip.path === 'add') {
        return false;
      }
      const exists = fileExists(clip.path);
      if (!exists) {
        this.removeClip(clip.path, streamId);
        return false;
      }
      if (streamId) {
        return clip.streamInfo?.[streamId];
      }
      return true;
    });
  }

  getClipsLoaded(clips: TClip[], streamId?: string): boolean {
    return this.getClips(clips, streamId).every(clip => clip.loaded);
  }

  private hasUnloadedClips(streamId?: string) {
    return !this.views.clips
      .filter(c => {
        if (!c.enabled) return false;
        if (!streamId) return true;
        return c.streamInfo && c.streamInfo[streamId] !== undefined;
      })
      .every(clip => clip.loaded);
  }

  enableOnlySpecificClips(clips: TClip[], streamId?: string) {
    clips.forEach(clip => {
      this.UPDATE_CLIP({
        path: clip.path,
        enabled: false,
      });
    });

    // Enable specific clips
    const clipsToEnable = this.getClips(clips, streamId);
    clipsToEnable.forEach(clip => {
      this.UPDATE_CLIP({
        path: clip.path,
        enabled: true,
      });
    });
  }

  // =================================================================================================
  // STREAM logic
  // =================================================================================================
  // TODO M: Temp way to solve the issue
  addStream(streamInfo: IHighlightedStream) {
    return new Promise<void>(resolve => {
      this.ADD_HIGHLIGHTED_STREAM(streamInfo);
      setTimeout(() => {
        resolve();
      }, 2000);
    });
  }

  updateStream(streamInfo: IHighlightedStream) {
    this.UPDATE_HIGHLIGHTED_STREAM(streamInfo);
  }

  removeStream(streamId: string) {
    this.REMOVE_HIGHLIGHTED_STREAM(streamId);

    //Remove clips from stream
    const clipsToRemove = this.getClips(this.views.clips, streamId);
    clipsToRemove.forEach(clip => {
      this.removeClip(clip.path, streamId);
    });
  }

  // =================================================================================================
  // SCRUB logic
  // =================================================================================================
  private async ensureScrubDirectory() {
    try {
      try {
        //If possible to read, directory exists, if not, catch and mkdir
        await fs.readdir(SCRUB_SPRITE_DIRECTORY);
      } catch (error: unknown) {
        await fs.mkdir(SCRUB_SPRITE_DIRECTORY);
      }
    } catch (error: unknown) {
      console.log('Error creating scrub sprite directory');
    }
  }
  async removeScrubFile(clipPath: string | undefined) {
    if (!clipPath) {
      console.warn('No scrub file path provided');
      return;
    }
    try {
      await fs.remove(clipPath);
    } catch (error: unknown) {
      console.error('Error removing scrub file', error);
    }
  }

  // =================================================================================================
  // EXPORT logic
  // =================================================================================================
  /**
   * Exports the video using the currently configured settings
   * Return true if the video was exported, or false if not.
   */
  async export(
    preview = false,
    streamId: string | undefined = undefined,
    orientation: TOrientation = EOrientation.HORIZONTAL,
  ) {
    this.resetRenderingClips();
    await this.loadClips(streamId);

    if (this.hasUnloadedClips(streamId)) {
      console.error('Highlighter: Export called while clips are not fully loaded!: ');
      return;
    }

    if (this.views.exportInfo.exporting) {
      console.error('Highlighter: Cannot export until current export operation is finished');
      return;
    }
    this.SET_EXPORT_INFO({
      exporting: true,
      currentFrame: 0,
      step: EExportStep.AudioMix,
      cancelRequested: false,
      error: null,
    });

    let renderingClips: RenderingClip[] = await this.generateRenderingClips(streamId, orientation);
    const exportOptions: IExportOptions = this.generateExportOptions(
      renderingClips,
      preview,
      orientation,
    );

    // Reset all clips
    await pmap(renderingClips, c => c.reset(exportOptions), {
      onProgress: c => {
        if (c.deleted) {
          this.UPDATE_CLIP({ path: c.sourcePath, deleted: true });
        }
      },
    });

    // TODO: For now, just remove deleted clips from the video
    // In the future, abort export and surface error to the user.
    renderingClips = renderingClips.filter(c => !c.deleted);

    if (!renderingClips.length) {
      console.error('Highlighter: Export called without any clips!');
      this.SET_EXPORT_INFO({
        exporting: false,
        exported: false,
        error: $t('Please select at least one clip to export a video'),
      });
      return;
    }

    const setExportInfo = (partialExportInfo: Partial<IExportInfo>) => {
      this.SET_EXPORT_INFO(partialExportInfo);
    };
    const recordAnalyticsEvent = (type: TAnalyticsEvent, data: Record<string, unknown>) => {
      this.usageStatisticsService.recordAnalyticsEvent(type, data);
    };
    const handleFrame = (currentFrame: number) => {
      this.setCurrentFrame(currentFrame);
    };

    startRendering(
      {
        isPreview: preview,
        renderingClips,
        exportInfo: this.views.exportInfo,
        exportOptions,
        audioInfo: this.views.audio,
        transitionDuration: this.views.transitionDuration,
        transition: this.views.transition,
        useAiHighlighter: this.views.useAiHighlighter,
        streamId,
      },
      handleFrame,
      setExportInfo,
      recordAnalyticsEvent,
    );

    this.SET_UPLOAD_INFO({ videoId: null });
  }

  private generateExportOptions(
    renderingClips: RenderingClip[],
    preview: boolean,
    orientation: string,
  ) {
    const exportOptions: IExportOptions = preview
      ? { width: 1280 / 4, height: 720 / 4, fps: 30, preset: 'ultrafast' }
      : {
        width: this.views.exportInfo.resolution === 720 ? 1280 : 1920,
        height: this.views.exportInfo.resolution === 720 ? 720 : 1080,
        fps: this.views.exportInfo.fps,
        preset: this.views.exportInfo.preset,
      };

    if (orientation === 'vertical') {
      // adds complex filter and flips width and height
      addVerticalFilterToExportOptions(this.views.clips, renderingClips, exportOptions);
    }
    return exportOptions;
  }

  private async generateRenderingClips(streamId?: string, orientation?: string) {
    let renderingClips: RenderingClip[] = [];

    if (streamId) {
      renderingClips = this.getClips(this.views.clips, streamId)
        .filter(
          clip =>
            !!clip && clip.enabled && clip.streamInfo && clip.streamInfo[streamId] !== undefined,
        )
        .sort(
          (a: TClip, b: TClip) =>
            (a.streamInfo?.[streamId]?.orderPosition ?? 0) -
            (b.streamInfo?.[streamId]?.orderPosition ?? 0),
        )
        .map(c => {
          const clip = this.renderingClips[c.path];

          clip.startTrim = c.startTrim;
          clip.endTrim = c.endTrim;

          return clip;
        });
    } else {
      renderingClips = this.views.clips
        .filter(c => c.enabled)
        .sort((a: TClip, b: TClip) => a.globalOrderPosition - b.globalOrderPosition)
        .map(c => {
          const clip = this.renderingClips[c.path];

          clip.startTrim = c.startTrim;
          clip.endTrim = c.endTrim;

          return clip;
        });
    }

    if (this.views.video.intro.path && orientation !== 'vertical') {
      const intro: RenderingClip = new RenderingClip(this.views.video.intro.path);
      await intro.init();
      intro.startTrim = 0;
      intro.endTrim = 0;
      renderingClips.unshift(intro);
    }
    if (this.views.video.outro.path && orientation !== 'vertical') {
      const outro = new RenderingClip(this.views.video.outro.path);
      await outro.init();
      outro.startTrim = 0;
      outro.endTrim = 0;
      renderingClips.push(outro);
    }
    return renderingClips;
  }

  // We throttle because this can go extremely fast, especially on previews
  @throttle(100)
  private setCurrentFrame(frame: number) {
    // Avoid a race condition where we reset the exported flag
    if (this.views.exportInfo.exported) return;
    this.SET_EXPORT_INFO({ currentFrame: frame });
  }

  cancelExport() {
    this.SET_EXPORT_INFO({ cancelRequested: true });
  }

  resetRenderingClips() {
    this.renderingClips = {};
  }

  // =================================================================================================
  // AI-HIGHLIGHTER logic
  // =================================================================================================

  setAiHighlighter(state: boolean) {
    this.SET_USE_AI_HIGHLIGHTER(state);
    this.usageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
      type: 'Toggled',
      value: state,
    });
  }

  toggleAiHighlighter() {
    if (this.state.useAiHighlighter) {
      this.SET_USE_AI_HIGHLIGHTER(false);
    } else {
      this.SET_USE_AI_HIGHLIGHTER(true);
    }
  }

  async installAiHighlighter(
    downloadNow: boolean = false,
    location: 'Highlighter-tab' | 'Go-live-flow',
  ) {
    this.usageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
      type: 'Installation',
      location,
    });

    this.setAiHighlighter(true);
    if (downloadNow) {
      await this.aiHighlighterUpdater.isNewVersionAvailable();
      this.startUpdater();
    } else {
      // Only for go live view to immediately show the toggle. For other flows, the updater will set the version
      this.SET_HIGHLIGHTER_VERSION('0.0.0');
    }
  }

  async uninstallAiHighlighter() {
    this.setAiHighlighter(false);
    this.SET_HIGHLIGHTER_VERSION('');

    await this.aiHighlighterUpdater?.uninstall();
  }

  /**
   * Start updater process
   */
  async startUpdater() {
    try {
      this.SET_UPDATER_STATE(true);
      this.SET_HIGHLIGHTER_VERSION(this.aiHighlighterUpdater.version || '');
      await this.aiHighlighterUpdater.update(progress => this.updateProgress(progress));
    } catch (e: unknown) {
      console.error('Error updating AI Highlighter:', e);
      this.usageStatisticsService.recordAnalyticsEvent('Highlighter', {
        type: 'UpdateError',
        newVersion: this.aiHighlighterUpdater.version,
      });
    } finally {
      this.SET_UPDATER_STATE(false);
    }
  }
  private updateProgress(progress: IDownloadProgress) {
    // this is a lie and its not a percent, its float from 0 and 1
    this.SET_UPDATER_PROGRESS(progress.percent * 100);
  }

  cancelHighlightGeneration(streamId: string): void {
    const stream = this.views.highlightedStreams.find(s => s.id === streamId);
    if (stream && stream.abortController) {
      console.log('cancelHighlightGeneration', streamId);
      stream.abortController.abort();
    }
  }

  async restartAiDetection(filePath: string, streamInfo: IHighlightedStream) {
    this.removeStream(streamInfo.id);

    const milestonesPath = await this.prepareMilestonesFile(streamInfo.id);

    const streamInfoForHighlighter: IStreamInfoForAiHighlighter = {
      id: streamInfo.id,
      title: streamInfo.title,
      game: streamInfo.game,
      milestonesPath,
    };

    this.detectAndClipAiHighlights(filePath, streamInfoForHighlighter);
  }

  async detectAndClipAiHighlights(
    filePath: string,
    streamInfo: IStreamInfoForAiHighlighter,
    delayStart = false,
  ): Promise<void> {
    if (this.aiHighlighterFeatureEnabled === false) {
      console.log('HighlighterService: Not enabled');
      return;
    }

    // if update is already in progress, need to wait until it's done
    if (this.aiHighlighterUpdater.updateInProgress) {
      await this.aiHighlighterUpdater.currentUpdate;
    } else if (await this.aiHighlighterUpdater.isNewVersionAvailable()) {
      await this.startUpdater();
    }

    const fallbackTitle = 'awesome-stream';
    const sanitizedTitle = streamInfo.title
      ? streamInfo.title.replace(/[\\/:"*?<>|]+/g, ' ')
      : extractDateTimeFromPath(filePath) || fallbackTitle;

    const setStreamInfo: IHighlightedStream = {
      state: {
        type: EAiDetectionState.IN_PROGRESS,
        progress: 0,
      },
      date: moment().toISOString(),
      id: streamInfo.id || 'noId',
      title: sanitizedTitle,
      game: streamInfo.game || EGame.UNSET,
      abortController: new AbortController(),
      path: filePath,
    };

    this.streamMilestones = {
      streamId: setStreamInfo.id,
      milestones: [],
    };

    await this.addStream(setStreamInfo);

    const progressTracker = new ProgressTracker(progress => {
      setStreamInfo.state.progress = progress;
      this.updateStream(setStreamInfo);
    });

    const renderHighlights = async (partialHighlights: IHighlight[]) => {
      console.log('🔄 cutHighlightClips');
      this.updateStream(setStreamInfo);
      const clipData = await cutHighlightClips(filePath, partialHighlights, setStreamInfo);
      console.log('✅ cutHighlightClips');
      // 6. add highlight clips
      progressTracker.destroy();
      setStreamInfo.state.type = EAiDetectionState.FINISHED;
      this.updateStream(setStreamInfo);

      console.log('🔄 addClips', clipData);
      this.addAiClips(clipData, streamInfo);
      console.log('✅ addClips');
    };

    console.log('🔄 HighlighterData');
    try {
      if (delayStart) {
        await this.wait(5000);
      }

      const highlighterResponse = await getHighlightClips(
        filePath,
        this.userService.getLocalUserId(),
        renderHighlights,
        setStreamInfo.abortController!.signal,
        (progress: number) => {
          progressTracker.updateProgressFromHighlighter(progress);
        },
        streamInfo.milestonesPath,
        (milestone: IHighlighterMilestone) => {
          this.streamMilestones?.milestones?.push(milestone);
        },
        streamInfo.game === 'unset' ? null : streamInfo.game,
      );

      this.usageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
        type: 'Detection',
        clips: highlighterResponse.length,
        game: 'Fortnite', // hardcode for now
        streamId: this.streamMilestones?.streamId,
      });
      console.log('✅ Final HighlighterData', highlighterResponse);
    } catch (error: unknown) {
      if (error instanceof Error && error.message === 'Highlight generation canceled') {
        setStreamInfo.state.type = EAiDetectionState.CANCELED_BY_USER;
        this.usageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
          type: 'DetectionCanceled',
          reason: EAiDetectionState.CANCELED_BY_USER,
          game: 'Fortnite',
        });
      } else {
        console.error('Error in highlight generation:', error);
        setStreamInfo.state.type = EAiDetectionState.ERROR;
        this.usageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
          type: 'DetectionFailed',
          reason: EAiDetectionState.ERROR,
          game: 'Fortnite',
          error_code: (error as { code?: number })?.code ?? 1,
        });
      }
    } finally {
      setStreamInfo.abortController = undefined;
      this.updateStream(setStreamInfo);
      // stopProgressUpdates();
    }

    return;
  }
  getRoundDetails(
    clips: TClip[],
  ): { round: number; inputs: IInput[]; duration: number; hypeScore: number }[] {
    const roundsMap: {
      [key: number]: { inputs: IInput[]; duration: number; hypeScore: number; count: number };
    } = {};
    clips.forEach(clip => {
      const aiClip = isAiClip(clip) ? clip : undefined;
      const round = aiClip?.aiInfo?.metadata?.round ?? undefined;
      if (aiClip?.aiInfo?.inputs && round) {
        if (!roundsMap[round]) {
          roundsMap[round] = { inputs: [], duration: 0, hypeScore: 0, count: 0 };
        }
        roundsMap[round].inputs.push(...aiClip.aiInfo.inputs);
        roundsMap[round].duration += aiClip.duration
          ? aiClip.duration - aiClip.startTrim - aiClip.endTrim
          : 0;
        roundsMap[round].hypeScore += aiClip.aiInfo.score;
        roundsMap[round].count += 1;
      }
    });

    return Object.keys(roundsMap).map(round => {
      const averageScore =
        roundsMap[parseInt(round, 10)].hypeScore / roundsMap[parseInt(round, 10)].count;
      const hypeScore = Math.ceil(Math.min(1, Math.max(0, averageScore)) * 5);

      return {
        round: parseInt(round, 10),
        inputs: roundsMap[parseInt(round, 10)].inputs,
        duration: roundsMap[parseInt(round, 10)].duration,
        hypeScore,
      };
    });
  }

  /**
   * Create milestones file if ids match and return path
   */
  private async prepareMilestonesFile(streamId: string): Promise<string | undefined> {
    if (
      !this.streamMilestones ||
      this.streamMilestones.streamId !== streamId ||
      this.streamMilestones.milestones.length === 0
    ) {
      return;
    }

    const milestonesPath = path.join(
      AiHighlighterUpdater.basepath,
      'milestones',
      'milestones.json',
    );

    const milestonesData = JSON.stringify(this.streamMilestones.milestones);
    await fs.outputFile(milestonesPath, milestonesData);

    return milestonesPath;
  }
  // =================================================================================================
  // UPLOAD logic
  // =================================================================================================

  cancelFunction: (() => void) | null = null;
  /**
   * Will cancel the currently in progress upload
   */
  cancelUpload() {
    if (this.cancelFunction && this.views.uploadInfo.uploading) {
      this.SET_UPLOAD_INFO({ cancelRequested: true });
      this.cancelFunction();
    }
  }

  clearUpload() {
    this.CLEAR_UPLOAD();
  }

  async uploadYoutube(options: IYoutubeVideoUploadOptions, streamId: string | undefined) {
    if (!this.userService.state.auth?.platforms.youtube) {
      throw new Error('Cannot upload without YT linked');
    }

    if (!this.views.exportInfo.exported) {
      throw new Error('Cannot upload when export is not complete');
    }

    if (this.views.uploadInfo.uploading) {
      throw new Error('Cannot start a new upload when uploading is in progress');
    }

    this.SET_UPLOAD_INFO({ uploading: true, cancelRequested: false, error: false });

    const yt = getPlatformService('youtube') as YoutubeService;

    const { cancel, complete } = yt.uploader.uploadVideo(
      this.views.exportInfo.file,
      options,
      progress => {
        this.SET_UPLOAD_INFO({
          uploadedBytes: progress.uploadedBytes,
          totalBytes: progress.totalBytes,
        });
      },
    );

    this.cancelFunction = cancel;
    let result: IYoutubeUploadResponse | null = null;

    try {
      result = await complete;
    } catch (e: unknown) {
      if (this.views.uploadInfo.cancelRequested) {
        console.log('The upload was canceled');
      } else {
        Sentry.withScope(scope => {
          scope.setTag('feature', 'highlighter');
          console.error('Got error uploading YT video', e);
        });

        this.SET_UPLOAD_INFO({ error: true });
        this.usageStatisticsService.recordAnalyticsEvent(
          this.views.useAiHighlighter ? 'AIHighlighter' : 'Highlighter',
          {
            type: 'UploadYouTubeError',
          },
        );
      }
    }

    this.cancelFunction = null;
    this.SET_UPLOAD_INFO({
      uploading: false,
      cancelRequested: false,
      videoId: result ? result.id : null,
    });

    if (result) {
      this.usageStatisticsService.recordAnalyticsEvent(
        this.views.useAiHighlighter ? 'AIHighlighter' : 'Highlighter',
        {
          type: 'UploadYouTubeSuccess',
          streamId,
          privacy: options.privacyStatus,
          videoLink:
            options.privacyStatus === 'public'
              ? `https://youtube.com/watch?v=${result.id}`
              : undefined,
        },
      );
    }
  }

  async uploadStorage(platform: string) {
    this.SET_UPLOAD_INFO({ uploading: true, cancelRequested: false, error: false });

    const { cancel, complete, size } = await this.sharedStorageService.actions.return.uploadFile(
      this.views.exportInfo.file,
      progress => {
        this.SET_UPLOAD_INFO({
          uploadedBytes: progress.uploadedBytes,
          totalBytes: progress.totalBytes,
        });
      },
      error => {
        this.SET_UPLOAD_INFO({ error: true });
        console.error(error);
      },
    );
    this.cancelFunction = cancel;
    let id;
    try {
      const result = await complete;
      id = result.id;
    } catch (e: unknown) {
      if (this.views.uploadInfo.cancelRequested) {
        console.log('The upload was canceled');
      } else {
        this.SET_UPLOAD_INFO({ uploading: false, error: true });
        this.usageStatisticsService.recordAnalyticsEvent('Highlighter', {
          type: 'UploadStorageError',
          fileSize: size,
          platform,
        });
      }
    }
    this.cancelFunction = null;
    this.SET_UPLOAD_INFO({ uploading: false, cancelRequested: false, videoId: id || null });

    if (id) {
      this.usageStatisticsService.recordAnalyticsEvent('Highlighter', {
        type: 'UploadStorageSuccess',
        fileSize: size,
        platform,
      });
    }

    return id;
  }

  /**
   * Utility function that returns a promise that resolves after a specified delay
   * @param ms Delay in milliseconds
   * @returns Promise that resolves after the delay
   */
  wait(ms: number): Promise<void> {
    return new Promise<void>(resolve => setTimeout(resolve, ms));
  }
}
