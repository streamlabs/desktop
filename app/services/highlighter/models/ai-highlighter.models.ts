export type TOrientation = EOrientation.HORIZONTAL | EOrientation.VERTICAL;
export enum EOrientation {
  HORIZONTAL = 'horizontal',
  VERTICAL = 'vertical',
}

export enum EGameState {
  INTERNAL = 'internal',
  LIVE = 'live',
  BETA_LIVE = 'beta_live',
}

interface IImportModalConfig {
  backgroundColor: string;
  accentColor: string;
  artwork: string;
  verticalExampleVideo?: string;
  horizontalExampleVideo?: string;
}
export interface IGameConfig {
  name: EGame;
  label: string; // Must be same as twitch
  gameModes: string;
  thumbnail: string;
  state: EGameState;
  inputTypeMap: Record<string, IEventInfo | IDefaultEventInfo>;
  importModalConfig: undefined | IImportModalConfig;
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

// space -> underscore
export enum EGame {
  FORTNITE = 'fortnite',
  WARZONE = 'warzone',
  BLACK_OPS_6 = 'black_ops_6',
  MARVEL_RIVALS = 'marvel_rivals',
  WAR_THUNDER = 'war_thunder',
  VALORANT = 'valorant',
  COUNTER_STRIKE_2 = 'counter_strike_2',
  APEX_LEGENDS = 'apex_legends',
  PUBG = 'pubg',
  RAINBOW_SIX_SIEGE = 'rainbow_six_siege',
  OVERWATCH_2 = 'overwatch_2',
  LEAGUE_OF_LEGENDS = 'league_of_legends',
  BATTLEFIELD_6 = 'battlefield_6',
  ARC_RAIDERS = 'arc_raiders',
  ROCKET_LEAGUE = 'rocket_league',
  DOTA_2 = 'dota_2',
  DEAD_BY_DAYLIGHT = 'dead_by_daylight',
  UNSET = 'unset',
}

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

// Message
export type EHighlighterMessageTypes =
  | 'progress'
  | 'inputs'
  | 'inputs_partial'
  | 'highlights'
  | 'milestone';

export interface IHighlighterMessage {
  type: EHighlighterMessageTypes;
  json: {};
}

export interface IHighlighterProgressMessage {
  progress: number;
}

export interface IHighlighterMilestone {
  name: string;
  weight: number;
  data: IHighlighterMessage[] | null;
}
