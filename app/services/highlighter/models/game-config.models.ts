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

export const FORTNITE_CONFIG: IGameConfig = {
  name: EGame.FORTNITE,
  label: 'Fortnite',
  gameModes: 'Battle Royale, Zero Build, Reload, OG',
  thumbnail: `https://cdn.streamlabs.com/static/imgs/game-thumbnails/${EGame.FORTNITE}.png`,
  state: EGameState.LIVE,
  importModalConfig: {
    backgroundColor: '#1C1D45',
    accentColor: '#DC8FF2',
    artwork: 'https://i.ibb.co/5XcCjnRt/fortnite.png',
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
  thumbnail: `https://cdn.streamlabs.com/static/imgs/game-thumbnails/${EGame.WARZONE}.png`,
  state: EGameState.INTERNAL,
  inputTypeMap: {
    ...COMMON_TYPES,
  },
  importModalConfig: undefined,
};
const BLACK_OPS_6_CONFIG: IGameConfig = {
  name: EGame.BLACK_OPS_6,
  label: 'Call of Duty: Black Ops 6',
  gameModes: '',
  thumbnail: 'https://cdn.streamlabs.com/static/imgs/game-thumbnails/call-of-duty-black-ops-6.png',
  state: EGameState.INTERNAL,
  inputTypeMap: {
    ...COMMON_TYPES,
  },
  importModalConfig: {
    accentColor: '#FEA41E',
    artwork: 'https://i.ibb.co/b56wknbH/black-ops-6.png',
    backgroundColor: '#151B1A',
  },
};

const MARVEL_RIVALS_CONFIG: IGameConfig = {
  name: EGame.MARVEL_RIVALS,
  label: 'Marvel Rivals',
  gameModes: '',
  thumbnail: 'https://cdn.streamlabs.com/static/imgs/game-thumbnails/marvel-rivals.png',
  state: EGameState.INTERNAL,
  inputTypeMap: {
    ...COMMON_TYPES,
  },
  importModalConfig: undefined,
};

const WAR_THUNDER_CONFIG: IGameConfig = {
  name: EGame.WAR_THUNDER,
  label: 'War Thunder',
  gameModes: '',
  thumbnail: 'https://cdn.streamlabs.com/static/imgs/game-thumbnails/war-thunder.png',
  state: EGameState.INTERNAL,
  inputTypeMap: {
    ...COMMON_TYPES,
  },
  importModalConfig: undefined,
};

const VALORANT_CONFIG: IGameConfig = {
  name: EGame.VALORANT,
  label: 'VALORANT',
  gameModes: '',
  thumbnail: '',
  state: EGameState.INTERNAL,
  inputTypeMap: {
    ...COMMON_TYPES,
  },
  importModalConfig: undefined,
};

const COUNTER_STRIKE_2_CONFIG: IGameConfig = {
  name: EGame.COUNTER_STRIKE_2,
  label: 'Counter-Strike 2',
  gameModes: '',
  thumbnail: '',
  state: EGameState.INTERNAL,
  inputTypeMap: {
    ...COMMON_TYPES,
  },
  importModalConfig: undefined,
};

const APEX_LEGENDS_CONFIG: IGameConfig = {
  name: EGame.APEX_LEGENDS,
  label: 'Apex Legends',
  gameModes: '',
  thumbnail: '',
  state: EGameState.INTERNAL,
  inputTypeMap: {
    ...COMMON_TYPES,
  },
  importModalConfig: undefined,
};

const PUBG_CONFIG: IGameConfig = {
  name: EGame.PUBG,
  label: 'PUBG',
  gameModes: '',
  thumbnail: '',
  state: EGameState.INTERNAL,
  inputTypeMap: {
    ...COMMON_TYPES,
  },
  importModalConfig: undefined,
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
const GAME_CONFIGS: Record<EGame, IGameConfig> = {
  [EGame.FORTNITE]: FORTNITE_CONFIG,
  [EGame.WARZONE]: WARZONE_CONFIG,
  [EGame.BLACK_OPS_6]: BLACK_OPS_6_CONFIG,
  [EGame.MARVEL_RIVALS]: MARVEL_RIVALS_CONFIG,
  [EGame.WAR_THUNDER]: WAR_THUNDER_CONFIG,
  [EGame.VALORANT]: VALORANT_CONFIG,
  [EGame.COUNTER_STRIKE_2]: COUNTER_STRIKE_2_CONFIG,
  [EGame.APEX_LEGENDS]: APEX_LEGENDS_CONFIG,
  [EGame.PUBG]: PUBG_CONFIG,
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
  if (
    game &&
    supportedGames.some(supportedGame => supportedGame.label.toLowerCase() === game.toLowerCase())
  ) {
    return true;
  }
  return false;
}
