import { EGame } from './ai-highlighter.models';
import { ITransitionInfo, IAudioInfo, IExportInfo, IVideoInfo } from './rendering.models';
import { TDisplayType } from 'services/settings-v2';

export type TClip = IReplayBufferClip | IManualClip;
export interface ITempRecordingInfo {
  recordingPath?: string;
  streamInfo?: IStreamInfoForAiHighlighter;
  source?: TOpenedFrom;
}

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
 * Which of the two apps Desktop should talk to.
 *
 * Replay replaces the standalone Highlighter app, but Highlighter users migrate from inside
 * Highlighter so they keep their data — it merges and installs Replay itself. So a user who only
 * has Highlighter gets sent there rather than having Replay installed underneath them, and Replay
 * wins as soon as it exists.
 */
export type TInstalledHighlighterApp = 'replay' | 'highlighter' | 'none';

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
}
interface IReplayBufferClip extends IBaseClip {
  source: 'ReplayBuffer';
}

interface IManualClip extends IBaseClip {
  source: 'Manual';
}

// STREAM
export interface IStreamInfoForAiHighlighter {
  id: string;
  game: EGame;
  title?: string;
}

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
