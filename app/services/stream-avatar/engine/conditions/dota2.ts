import { ConditionDefinition } from '.';

export type Dota2ConditionPropsMap = {
  //----------------------
  // Dota 2
  //----------------------

  // Game Flow
  'dota_2.game_start': undefined;
  'dota_2.game_end': undefined;

  // Win / Lose
  'dota_2.victory': undefined;
  'dota_2.defeat': undefined;

  // Combat
  'dota_2.elimination': undefined;
  'dota_2.player_eliminated': undefined;

  // Objectives
  'dota_2.tower_destroyed': undefined;
  'dota_2.glyph_used': undefined;
};

export type Dota2ConditionType = keyof Dota2ConditionPropsMap;
export type Dota2ConditionProps<T extends Dota2ConditionType> = Dota2ConditionPropsMap[T];

export const Dota2Conditions: {
  [K in Dota2ConditionType]: ConditionDefinition<K>;
} = {
  'dota_2.game_start': {
    group: 'dota_2',
    name: 'game_start',
    label: 'Game Started',
    evaluate: ({ state }) => state.pendingEvents.has('game_start'),
  },

  'dota_2.game_end': {
    group: 'dota_2',
    name: 'game_end',
    label: 'Game Ended',
    evaluate: ({ state }) => state.pendingEvents.has('game_end'),
  },

  'dota_2.victory': {
    group: 'dota_2',
    name: 'victory',
    label: 'Victory',
    evaluate: ({ state }) => state.pendingEvents.has('victory'),
  },

  'dota_2.defeat': {
    group: 'dota_2',
    name: 'defeat',
    label: 'Defeat',
    evaluate: ({ state }) => state.pendingEvents.has('defeat'),
  },

  'dota_2.elimination': {
    group: 'dota_2',
    name: 'elimination',
    label: 'Hero Kill',
    evaluate: ({ state }) => state.pendingEvents.has('elimination'),
  },

  'dota_2.player_eliminated': {
    group: 'dota_2',
    name: 'player_eliminated',
    label: 'Player Died',
    evaluate: ({ state }) => state.pendingEvents.has('death'),
  },

  'dota_2.tower_destroyed': {
    group: 'dota_2',
    name: 'tower_destroyed',
    label: 'Tower Destroyed',
    evaluate: ({ state }) => state.pendingEvents.has('tower_destroyed'),
  },

  'dota_2.glyph_used': {
    group: 'dota_2',
    name: 'glyph_used',
    label: 'Glyph of Fortification Used',
    evaluate: ({ state }) => state.pendingEvents.has('glyph_used'),
  },
} as const;

export default Dota2Conditions;
