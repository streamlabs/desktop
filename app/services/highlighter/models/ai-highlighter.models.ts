export interface IGameConfig {
  name: EGame;
  inputTypeMap: Record<string, IEventInfo | IDefaultEventInfo>;
}

export interface TypeWording {
  emoji: string;
  description: string;
  orderPriority: number;
}

export interface IEventInfo {
  emoji: string;
  description: { singular: string; plural: string };
  orderPriority: number; //Ordering in the stream card
  includeInDropdown: boolean; //autoEditDropdown
  contextEvent: boolean; //eg start or end
}

export interface IDefaultEventInfo extends IEventInfo {
  aliases?: string[];
}

export enum EGame {
  FORTNITE = 'fortnite',
  UNSET = 'unset',
}

export type TOrientation = 'horizontal' | 'vertical';

export enum EHighlighterInputTypes {
  KILL = 'kill',
  KNOCKED = 'knocked',
  GAME_SEQUENCE = 'game_sequence',
  GAME_START = 'start_game',
  GAME_END = 'end_game',
  VOICE_ACTIVITY = 'voice_activity',
  DEATH = 'death',
  VICTORY = 'victory',
  DEPLOY = 'deploy',
}

export interface IHighlight {
  start_time: number;
  end_time: number;
  input_types: string[];
  inputs: IHighlighterInput[];
  score: number;
  metadata: { round: number; webcam_coordinates: ICoordinates };
}

export interface IAiClipInfo {
  inputs: IInput[];
  score: number;
  metadata: {
    round: number;
    webcam_coordinates: ICoordinates;
  };
}

export interface ICoordinates {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface IDeathMetadata {
  place: number;
}
export interface IKillMetadata {
  bot_kill: boolean;
}

export interface IInput {
  type: string;
  metadata?: IDeathMetadata | IKillMetadata;
}

export enum EAiDetectionState {
  INITIALIZED = 'initialized',
  IN_PROGRESS = 'detection-in-progress',
  ERROR = 'error',
  FINISHED = 'detection-finished',
  CANCELED_BY_USER = 'detection-canceled-by-user',
}
export interface IHighlighterInput {
  start_time: number;
  end_time?: number;
  type: string;
  origin: string;
  metadata?: IDeathMetadata | any;
}
export interface IHighlighterWord {
  start_time: number;
  end_time: number;
  text: string;
  probability: number;
}
// Message
export type EHighlighterMessageTypes =
  | 'progress'
  | 'inputs'
  | 'inputs_partial'
  | 'highlights'
  | 'milestone'
  | 'transcription';

export interface IHighlighterMessage {
  type: EHighlighterMessageTypes;
  json: {};
}

export interface IHighlighterProgressMessage {
  progress: number;
}
export interface IHighlighterTranscriptionMessage {
  words: IHighlighterWord[];
}

export interface IHighlighterMilestone {
  name: string;
  weight: number;
  data: IHighlighterMessage[] | null;
}
