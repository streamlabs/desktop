import { Ide } from 'aws-sdk/clients/codecatalyst';
import {
  IGameConfig,
  EHighlighterInputTypes,
  EGame,
  IEventInfo,
  IDefaultEventInfo,
} from './ai-highlighter.models';

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

const UNSET_CONFIG: IGameConfig = {
  name: EGame.UNSET,
  inputTypeMap: {
    ...COMMON_TYPES,
  },
};

const GAME_CONFIGS: Record<EGame, IGameConfig> = {
  [EGame.FORTNITE]: FORTNITE_CONFIG,
  [EGame.UNSET]: UNSET_CONFIG,
};

export function getConfigByGame(game: EGame | string): IGameConfig {
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
