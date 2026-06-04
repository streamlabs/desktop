import { ConditionDefinition } from '.';

export type MarvelRivalsConditionPropsMap = {
  //----------------------
  // Marvel Rivals
  //----------------------

  // Game Flow
  'marvel_rivals.game_end': undefined;

  // Win / Lose
  'marvel_rivals.victory': undefined;
  'marvel_rivals.defeat': undefined;

  // Combat
  'marvel_rivals.elimination': undefined;
  'marvel_rivals.player_eliminated': undefined;
};

export type MarvelRivalsConditionType = keyof MarvelRivalsConditionPropsMap;
export type MarvelRivalsConditionProps<
  T extends MarvelRivalsConditionType
> = MarvelRivalsConditionPropsMap[T];

export const MarvelRivalsConditions: {
  [K in MarvelRivalsConditionType]: ConditionDefinition<K>;
} = {
  'marvel_rivals.game_end': {
    group: 'marvel_rivals',
    name: 'game_end',
    label: 'Match Ended',
    evaluate: ({ state }) => state.pendingEvents.has('game_end'),
  },

  'marvel_rivals.victory': {
    group: 'marvel_rivals',
    name: 'victory',
    label: 'Victory',
    evaluate: ({ state }) => state.pendingEvents.has('victory'),
  },

  'marvel_rivals.defeat': {
    group: 'marvel_rivals',
    name: 'defeat',
    label: 'Defeat',
    evaluate: ({ state }) => state.pendingEvents.has('defeat'),
  },

  'marvel_rivals.elimination': {
    group: 'marvel_rivals',
    name: 'elimination',
    label: 'Hero Eliminated',
    evaluate: ({ state }) => state.pendingEvents.has('elimination'),
  },

  'marvel_rivals.player_eliminated': {
    group: 'marvel_rivals',
    name: 'player_eliminated',
    label: 'Player Eliminated',
    evaluate: ({ state }) => state.pendingEvents.has('death'),
  },
} as const;

export default MarvelRivalsConditions;
