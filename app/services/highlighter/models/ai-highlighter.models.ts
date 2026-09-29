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
  titleIcon: string;
  thumbnail: string;
  state: EGameState;
  inputTypeMap: Record<string, IEventInfo | IDefaultEventInfo>;
  importModalConfig: undefined | IImportModalConfig;
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
  BLACK_OPS_7 = 'black_ops_7',
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
  MARATHON = 'marathon',
  F1_25 = 'f1_25',
  EA_SPORTS_FC_26 = 'ea_sports_fc_26',
  NBA_2K26 = 'nba_2k26',
  DEADLOCK = 'deadlock',
  FORZA_HORIZON_6 = 'forza_horizon_6',
  ENSHROUDED = 'enshrouded',
  MINECRAFT = 'minecraft',
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
