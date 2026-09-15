import {
  IAiClipInfo,
  IHighlighterMilestone,
  EAiDetectionState,
  EGame,
  IHighlight,
} from './ai-highlighter.models';
import { ITransitionInfo, IAudioInfo, IExportInfo, IVideoInfo } from './rendering.models';
import { TDisplayType } from 'services/settings-v2';

export type TClip = IAiClip | IReplayBufferClip | IManualClip;
export interface ITempRecordingInfo {
  recordingPath?: string;
  streamInfo?: IStreamInfoForAiHighlighter;
  source?: TOpenedFrom;
}
export const isAiClip = (clip: TClip): clip is IAiClip => clip.source === 'AiClip';

export type TOpenedFrom = 'after-stream' | 'manual-import' | 'recordings-tab';

export interface IHighlighterState {
  clips: Dictionary<TClip>;
  transition: ITransitionInfo;
  video: IVideoInfo;
  audio: IAudioInfo;
  export: IExportInfo;
  uploads: IUploadInfo[];
  dismissedTutorial: boolean;
  error: string;
  useAiHighlighter: boolean;
  highlightedStreams: IHighlightedStream[];
  highlightedStreamsDictionary: Dictionary<IHighlightedStream>;
  updaterProgress: number;
  isUpdaterRunning: boolean;
  highlighterVersion: string;
  tempRecordingInfo: ITempRecordingInfo;
  replayInstall: IReplayInstallState;
}

export type EReplayInstallStep =
  | 'idle'
  | 'downloading'
  | 'installing'
  | 'verifying'
  | 'done'
  | 'error';

export interface IReplayInstallState {
  step: EReplayInstallStep;
  progress: number;
  error: string | null;
}

/**
 * Extra hand-off data written into the install origin marker Replay reads on first run.
 *
 * Everything here is optional and best-effort: it describes what Desktop is about to ask Replay
 * to do once the install finishes, so Replay launch the onboarding with more context.
 */
export interface IReplayInstallOriginMetadata {
  /**
   * Absolute path of the recording the user picked in the import dialog — the same path Desktop
   * sends via the `import` deeplink.
   */
  videoPath?: string;
  /** Game the user picked for that recording */
  game?: EGame;
}

// CLIP
export interface INewClipData {
  path: string;
  aiClipInfo: IAiClipInfo;
  startTime: number;
  endTime: number;
  startTrim: number;
  endTrim: number;
}

interface IBaseClip {
  path: string;
  loaded: boolean;
  enabled: boolean;
  scrubSprite?: string;
  startTrim: number;
  endTrim: number;
  duration?: number;
  deleted: boolean;
  globalOrderPosition: number;
  display?: TDisplayType;
  streamInfo:
    | {
        [streamId: string]: TStreamInfo;
      }
    | undefined;
}
interface IReplayBufferClip extends IBaseClip {
  source: 'ReplayBuffer';
}

interface IManualClip extends IBaseClip {
  source: 'Manual';
}

export interface IAiClip extends IBaseClip {
  source: 'AiClip';
  aiInfo: IAiClipInfo;
}

// STEAM
export type TStreamInfo =
  | {
      orderPosition: number;
      initialStartTime?: number;
      initialEndTime?: number;
    }
  | undefined; // initialTimesInStream

export interface IStreamInfoForAiHighlighter {
  id: string;
  game: EGame;
  title?: string;
  milestonesPath?: string;
}

export interface IStreamMilestones {
  streamId: string;
  milestones: IHighlighterMilestone[];
}
export interface IHighlightedStream {
  id: string;
  game: EGame;
  title: string;
  date: string;
  state: {
    type: EAiDetectionState;
    progress: number;
  };
  abortController?: AbortController;
  path: string;
  feedbackLeft?: boolean;
  highlights?: IHighlight[];
}

// VIEW
export enum EHighlighterView {
  CLIPS = 'clips',
  STREAM = 'stream',
  SETTINGS = 'settings',
}

interface TClipsViewState {
  view: EHighlighterView.CLIPS;
  id: string | undefined;
}
interface IStreamViewState {
  view: EHighlighterView.STREAM;
}

interface ISettingsViewState {
  view: EHighlighterView.SETTINGS;
}

export type IViewState = TClipsViewState | IStreamViewState | ISettingsViewState;

export enum EUploadPlatform {
  YOUTUBE = 'youtube',
  CROSSCLIP = 'crossclip',
  TYPESTUDIO = 'typestudio',
  VIDEOEDITOR = 'videoeditor',
}

export interface IUploadInfo {
  platform: EUploadPlatform;
  uploading: boolean;
  uploadedBytes: number;
  totalBytes: number;
  cancelRequested: boolean;
  videoId: string | null;
  error: boolean;
}
