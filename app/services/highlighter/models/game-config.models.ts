import { Ide } from 'aws-sdk/clients/codecatalyst';
import {
  IGameConfig,
  EHighlighterInputTypes,
  EGame,
  IEventInfo,
  IDefaultEventInfo,
  EGameState,
} from './ai-highlighter.models';
import Utils from 'services/utils';

export const TERMS = {
  ELIMINATION: { singular: 'elimination', plural: 'eliminations' },
  KNOCKED: { singular: 'knocked', plural: 'knocks' },
  KNOCKOUT: { singular: 'got knocked', plural: 'got knocked' },
  DEATH: { singular: 'death', plural: 'deaths' },
  DEFEAT: { singular: 'defeat', plural: 'defeats' },
  WIN: { singular: 'win', plural: 'wins' },
  DEPLOY: { singular: 'deploy', plural: 'deploys' },
  ROUND: { singular: 'round', plural: 'rounds' },
  STORM: { singular: 'storm event', plural: 'storm events' },
  MANUAL: { singular: 'manual clip', plural: 'manual clips' },
};

export const EMOJI = {
  GUN: '🔫',
  BOXING_GLOVES: '🥊',
  DEATH: '🪦',
  DEFEAT: '☠️',
  TROPHY: '🏆',
  BRONZE_MEDAL: '🥉',
  PARACHUTE: '🪂',
  DIZZY: '😵',
  ROUND: '🏁',
  STORM: '⛈️',
  ROBOT: '🤖',
  MANUAL: '🎬',
  FIRECRACKER: '🧨', // used for config fallback. ⚡ used in components as fallback
};

const COMMON_TYPES: Record<string, IDefaultEventInfo> = {
  ['round']: {
    emoji: EMOJI.ROUND,
    description: TERMS.ROUND,
    orderPriority: 1,
    includeInDropdown: true,
    contextEvent: false,
    aliases: ['sequence'],
  },
  ['manual']: {
    emoji: EMOJI.MANUAL,
    description: TERMS.MANUAL,
    orderPriority: 2,
    includeInDropdown: true,
    contextEvent: false,
    aliases: ['replaybuffer'],
  },
  ['elimination']: {
    emoji: EMOJI.GUN,
    description: TERMS.ELIMINATION,
    orderPriority: 4,
    includeInDropdown: true,
    contextEvent: false,
    aliases: ['kill'],
  },
  ['knockout']: {
    emoji: EMOJI.BOXING_GLOVES,
    description: TERMS.KNOCKED,
    orderPriority: 5,
    includeInDropdown: false,
    contextEvent: false,
    aliases: ['knocked'],
  },
  ['player_knocked']: {
    emoji: EMOJI.DIZZY,
    description: TERMS.KNOCKOUT,
    orderPriority: 5,
    includeInDropdown: false,
    contextEvent: false,
  },
  ['death']: {
    emoji: EMOJI.DEATH,
    description: TERMS.DEATH,
    orderPriority: 5,
    includeInDropdown: false,
    contextEvent: true,
  },
  ['defeat']: {
    emoji: EMOJI.DEFEAT,
    description: TERMS.DEFEAT,
    orderPriority: 5,
    includeInDropdown: false,
    contextEvent: true,
    aliases: ['lost'],
  },
  ['victory']: {
    emoji: EMOJI.TROPHY,
    description: TERMS.WIN,
    orderPriority: 3,
    includeInDropdown: true,
    contextEvent: true,
    aliases: ['win'],
  },
};

const thumbnailPath = 'https://cdn.streamlabs.com/static/imgs/game-thumbnails/';
const heroPath = 'https://cdn.streamlabs.com/static/imgs/hero-images/';
const exampleVideoPath = 'https://slobs-cdn.streamlabs.com/media/example-videos/';

export const FORTNITE_CONFIG: IGameConfig = {
  name: EGame.FORTNITE,
  label: 'Fortnite',
  gameModes: 'Battle Royale, Zero Build, Reload, OG',
  thumbnail: `${thumbnailPath}${EGame.FORTNITE}.png`,
  state: EGameState.LIVE,
  importModalConfig: {
    backgroundColor: '#1C1D45',
    accentColor: '#DC8FF2',
    artwork: `${heroPath}${EGame.FORTNITE}.png`,
    horizontalExampleVideo: `${exampleVideoPath}${EGame.FORTNITE}-horizontal.mp4`,
    verticalExampleVideo: `${exampleVideoPath}${EGame.FORTNITE}-vertical.mp4`,
  },
  inputTypeMap: {
    ...COMMON_TYPES,
    ['deploy']: {
      emoji: EMOJI.PARACHUTE,
      description: TERMS.DEPLOY,
      orderPriority: 4,
      includeInDropdown: false,
      contextEvent: true,
    },
    ['bot_kill']: {
      emoji: EMOJI.ROBOT,
      description: TERMS.ELIMINATION,
      orderPriority: 4,
      includeInDropdown: false,
      contextEvent: false,
    },
  },
};

const WARZONE_CONFIG: IGameConfig = {
  name: EGame.WARZONE,
  label: 'Call of Duty: Warzone',
  gameModes: '',
  thumbnail: `${thumbnailPath}${EGame.WARZONE}.png`,
  state: EGameState.LIVE,
  inputTypeMap: {
    ...COMMON_TYPES,
  },
  importModalConfig: {
    accentColor: '#2BAC74',
    artwork: `${heroPath}${EGame.WARZONE}.png`,
    backgroundColor: '#0A311C',
    horizontalExampleVideo: `${exampleVideoPath}${EGame.WARZONE}-horizontal.mp4`,
    verticalExampleVideo: `${exampleVideoPath}${EGame.WARZONE}-vertical.mp4`,
  },
};
const BLACK_OPS_6_CONFIG: IGameConfig = {
  name: EGame.BLACK_OPS_6,
  label: 'Call of Duty: Black Ops 6',
  gameModes: '',
  thumbnail: `${thumbnailPath}call-of-duty-black-ops-6.png`,
  state: EGameState.LIVE,
  inputTypeMap: {
    ...COMMON_TYPES,
  },
  importModalConfig: {
    accentColor: '#FEA41E',
    artwork: `${heroPath}${EGame.BLACK_OPS_6}.png`,
    backgroundColor: '#151B1A',
    horizontalExampleVideo: `${exampleVideoPath}${EGame.BLACK_OPS_6}-horizontal.mp4`,
    verticalExampleVideo: `${exampleVideoPath}${EGame.BLACK_OPS_6}-vertical.mp4`,
  },
};

const MARVEL_RIVALS_CONFIG: IGameConfig = {
  name: EGame.MARVEL_RIVALS,
  label: 'Marvel Rivals',
  gameModes: '',
  thumbnail: `${thumbnailPath}marvel-rivals.png`,
  state: EGameState.LIVE,
  inputTypeMap: {
    ...COMMON_TYPES,
  },
  importModalConfig: {
    accentColor: '#42BBC1',
    artwork: `${heroPath}${EGame.MARVEL_RIVALS}.png`,
    backgroundColor: '#5258AD',
    horizontalExampleVideo: `${exampleVideoPath}${EGame.MARVEL_RIVALS}-horizontal.mp4`,
    verticalExampleVideo: `${exampleVideoPath}${EGame.MARVEL_RIVALS}-vertical.mp4`,
  },
};

const WAR_THUNDER_CONFIG: IGameConfig = {
  name: EGame.WAR_THUNDER,
  label: 'War Thunder',
  gameModes: '',
  thumbnail: `${thumbnailPath}war-thunder.png`,
  state: EGameState.LIVE,
  inputTypeMap: {
    ...COMMON_TYPES,
  },
  importModalConfig: {
    accentColor: '#EC2D19',
    artwork: `${heroPath}${EGame.WAR_THUNDER}.png`,
    backgroundColor: '#A18474',
    horizontalExampleVideo: `${exampleVideoPath}${EGame.WAR_THUNDER}-horizontal.mp4`,
    verticalExampleVideo: `${exampleVideoPath}${EGame.WAR_THUNDER}-vertical.mp4`,
  },
};

const VALORANT_CONFIG: IGameConfig = {
  name: EGame.VALORANT,
  label: 'VALORANT',
  gameModes: '',
  thumbnail: `${thumbnailPath}${EGame.VALORANT}.png`,
  state: EGameState.LIVE,
  inputTypeMap: {
    ...COMMON_TYPES,
  },
  importModalConfig: {
    accentColor: '#FF4655',
    artwork: `${heroPath}${EGame.VALORANT}.png`,
    backgroundColor: '#162029',
  },
};

const COUNTER_STRIKE_2_CONFIG: IGameConfig = {
  name: EGame.COUNTER_STRIKE_2,
  label: 'Counter-Strike',
  gameModes: '',
  thumbnail: `${thumbnailPath}${EGame.COUNTER_STRIKE_2}.png`,
  state: EGameState.LIVE,
  inputTypeMap: {
    ...COMMON_TYPES,
  },
  importModalConfig: {
    accentColor: '#E38717',
    artwork: `${heroPath}${EGame.COUNTER_STRIKE_2}.png`,
    backgroundColor: '#BEBEBE',
  },
};

const APEX_LEGENDS_CONFIG: IGameConfig = {
  name: EGame.APEX_LEGENDS,
  label: 'Apex Legends',
  gameModes: '',
  thumbnail: `${thumbnailPath}${EGame.APEX_LEGENDS}.png`,
  state: EGameState.LIVE,
  inputTypeMap: {
    ...COMMON_TYPES,
  },
  importModalConfig: {
    accentColor: '#EBFF8A',
    artwork: `${heroPath}${EGame.APEX_LEGENDS}.png`,
    backgroundColor: '#C7D2CA',
  },
};

const PUBG_CONFIG: IGameConfig = {
  name: EGame.PUBG,
  label: 'PUBG: BATTLEGROUNDS',
  gameModes: '',
  thumbnail: `${thumbnailPath}${EGame.PUBG}.png`,
  state: EGameState.LIVE,
  inputTypeMap: {
    ...COMMON_TYPES,
  },
  importModalConfig: {
    accentColor: '#E38717',
    artwork: `${heroPath}${EGame.PUBG}.png`,
    backgroundColor: '#2D3953',
  },
};

const RAINBOW_SIX_SIEGE: IGameConfig = {
  name: EGame.RAINBOW_SIX_SIEGE,
  label: "Tom Clancy's Rainbow Six Siege X",
  gameModes: '',
  thumbnail: `${thumbnailPath}${EGame.RAINBOW_SIX_SIEGE}.png`,
  state: EGameState.LIVE,
  inputTypeMap: {
    ...COMMON_TYPES,
  },
  importModalConfig: {
    accentColor: '#5F98F7',
    artwork: `${heroPath}${EGame.RAINBOW_SIX_SIEGE}.png`,
    backgroundColor: '#25262A',
  },
};

const OVERWATCH_2: IGameConfig = {
  name: EGame.OVERWATCH_2,
  label: 'Overwatch 2',
  gameModes: '',
  thumbnail: `${thumbnailPath}${EGame.OVERWATCH_2}.png`,
  state: EGameState.LIVE,
  inputTypeMap: {
    ...COMMON_TYPES,
  },
  importModalConfig: {
    accentColor: '#E5803F',
    artwork: `${heroPath}${EGame.OVERWATCH_2}.png`,
    backgroundColor: '#cdc7cd',
  },
};

const LEAGUE_OF_LEGENDS: IGameConfig = {
  name: EGame.LEAGUE_OF_LEGENDS,
  label: 'League of Legends',
  gameModes: '',
  thumbnail: `${thumbnailPath}${EGame.LEAGUE_OF_LEGENDS}.png`,
  state: EGameState.LIVE,
  inputTypeMap: {
    ...COMMON_TYPES,
  },
  importModalConfig: {
    accentColor: '#9B9B9B',
    artwork: `${heroPath}${EGame.LEAGUE_OF_LEGENDS}.png`,
    backgroundColor: '#161D2B',
  },
};

const BATTLEFIELD_6: IGameConfig = {
  name: EGame.BATTLEFIELD_6,
  label: 'Battlefield 6',
  gameModes: '',
  thumbnail: `${thumbnailPath}${EGame.BATTLEFIELD_6}.png`,
  state: EGameState.LIVE,
  inputTypeMap: {
    ...COMMON_TYPES,
  },
  importModalConfig: {
    accentColor: '#FF3C00',
    artwork: `${heroPath}${EGame.BATTLEFIELD_6}.png`,
    backgroundColor: '#32383D',
  },
};

const UNSET_CONFIG: IGameConfig = {
  name: EGame.UNSET,
  label: 'unset',
  gameModes: 'unset',
  thumbnail: 'unset',
  state: EGameState.INTERNAL,
  inputTypeMap: {
    ...COMMON_TYPES,
  },
  importModalConfig: undefined,
};

// Each game must have a config like and the config must be added here.
export const GAME_CONFIGS: Record<EGame, IGameConfig> = {
  [EGame.FORTNITE]: FORTNITE_CONFIG, // ✅
  [EGame.WARZONE]: WARZONE_CONFIG, // ✅
  [EGame.BLACK_OPS_6]: BLACK_OPS_6_CONFIG, // ✅
  [EGame.MARVEL_RIVALS]: MARVEL_RIVALS_CONFIG, // ✅
  [EGame.WAR_THUNDER]: WAR_THUNDER_CONFIG, // ✅
  [EGame.VALORANT]: VALORANT_CONFIG, // ✅
  [EGame.COUNTER_STRIKE_2]: COUNTER_STRIKE_2_CONFIG,
  [EGame.APEX_LEGENDS]: APEX_LEGENDS_CONFIG, // ✅
  [EGame.PUBG]: PUBG_CONFIG, // ✅
  [EGame.RAINBOW_SIX_SIEGE]: RAINBOW_SIX_SIEGE, // ✅
  [EGame.OVERWATCH_2]: OVERWATCH_2,
  [EGame.LEAGUE_OF_LEGENDS]: LEAGUE_OF_LEGENDS, // ✅
  [EGame.BATTLEFIELD_6]: BATTLEFIELD_6, // ✅
  [EGame.UNSET]: UNSET_CONFIG,
};

export const supportedGames = Object.entries(GAME_CONFIGS)
  .filter(([gameKey]) => gameKey !== EGame.UNSET)
  .filter(([gameKey, gameConfig]) => {
    if (Utils.getHighlighterEnvironment() === 'production') {
      return gameConfig.state !== EGameState.INTERNAL;
    } else {
      return true;
    }
  })
  .map(([gameKey, gameConfig]) => {
    return {
      value: gameKey as EGame,
      label: gameConfig.label,
      description: gameConfig.gameModes,
      image: gameConfig.thumbnail,
    };
  });

export function getConfigByGame(game: EGame | undefined): IGameConfig | undefined {
  if (!game) {
    return undefined;
  }
  const lowercaseGame = game.toLowerCase() as EGame;
  return GAME_CONFIGS[lowercaseGame] || UNSET_CONFIG;
}
export function getContextEventTypes(game: EGame): string[] {
  const gameConfig = getConfigByGame(game);
  const contextTypes: string[] = [];

  Object.entries(gameConfig.inputTypeMap).forEach(([type, typeConfig]) => {
    if (typeConfig.contextEvent === true) {
      contextTypes.push(type);
    }
  });

  return contextTypes;
}

export function getEventConfig(game: EGame, eventType: string): IEventInfo | IDefaultEventInfo {
  const lowercaseEventType = eventType.toLocaleLowerCase();
  const gameConfig = getConfigByGame(game);

  // Check if event exists in game config
  if (gameConfig.inputTypeMap[lowercaseEventType]) {
    return gameConfig.inputTypeMap[lowercaseEventType];
  }

  // Check if event exists in Unset config
  if (UNSET_CONFIG.inputTypeMap[lowercaseEventType]) {
    return UNSET_CONFIG.inputTypeMap[lowercaseEventType];
  }

  // Check if event exists in aliases
  const unsetEvent = Object.entries(
    (UNSET_CONFIG.inputTypeMap as unknown) as IDefaultEventInfo,
  ).find(([_, config]) => config.aliases?.includes(lowercaseEventType));

  if (unsetEvent) {
    return unsetEvent[1];
  }

  return {
    emoji: EMOJI.FIRECRACKER,
    description: { singular: eventType, plural: eventType },
    orderPriority: 99,
    includeInDropdown: false,
    contextEvent: false,
  };
}

export function isGameSupported(game: string | undefined) {
  const gameValue = supportedGames.find(
    supportedGame => supportedGame.label.toLowerCase() === game?.toLowerCase(),
  )?.value;
  if (game && gameValue) {
    return gameValue;
  }
  return false;
}
