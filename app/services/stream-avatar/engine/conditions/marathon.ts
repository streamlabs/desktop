import { ConditionDefinition } from '.';

export type MarathonConditionPropsMap = {
  //----------------------
  // Marathon
  //----------------------

  // Game Flow
  'marathon.game_start': undefined;
  'marathon.game_end': undefined;

  // Win / Lose
  'marathon.victory': undefined;
  'marathon.defeat': undefined;

  // Player
  'marathon.player_knocked': undefined;
  'marathon.player_eliminated': undefined;

  // Enemy
  'marathon.elimination': undefined;
  'marathon.knockout': undefined;
};

export type MarathonConditionType = keyof MarathonConditionPropsMap;
export type MarathonConditionProps<T extends MarathonConditionType> = MarathonConditionPropsMap[T];

export const MarathonConditions: {
  [K in MarathonConditionType]: ConditionDefinition<K>;
} = {
  'marathon.game_start': {
    group: 'marathon',
    name: 'game_start',
    label: 'Match Started',
    evaluate: ({ state }) => state.pendingEvents.has('game_start'),
  },

  'marathon.game_end': {
    group: 'marathon',
    name: 'game_end',
    label: 'Match Ended',
    evaluate: ({ state }) => state.pendingEvents.has('game_end'),
  },

  'marathon.victory': {
    group: 'marathon',
    name: 'victory',
    label: 'Exfiltrated (Victory)',
    evaluate: ({ state }) => state.pendingEvents.has('victory'),
  },

  'marathon.defeat': {
    group: 'marathon',
    name: 'defeat',
    label: 'Eliminated (Defeat)',
    evaluate: ({ state }) => state.pendingEvents.has('defeat'),
  },

  'marathon.player_knocked': {
    group: 'marathon',
    name: 'player_knocked',
    label: 'Player Knocked',
    evaluate: ({ state }) => state.pendingEvents.has('player_knocked'),
  },

  'marathon.player_eliminated': {
    group: 'marathon',
    name: 'player_eliminated',
    label: 'Player Eliminated',
    evaluate: ({ state }) => state.pendingEvents.has('death'),
  },

  'marathon.elimination': {
    group: 'marathon',
    name: 'elimination',
    label: 'Runner Eliminated',
    evaluate: ({ state }) => state.pendingEvents.has('elimination'),
  },

  'marathon.knockout': {
    group: 'marathon',
    name: 'knockout',
    label: 'Runner Knocked',
    evaluate: ({ state }) => state.pendingEvents.has('knockout'),
  },
} as const;

export default MarathonConditions;
