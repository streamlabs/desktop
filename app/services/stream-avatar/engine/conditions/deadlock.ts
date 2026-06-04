import { ConditionDefinition } from '.';

export type DeadlockConditionPropsMap = {
  //----------------------
  // Deadlock
  //----------------------

  // Game Flow
  'deadlock.game_start': undefined;
  'deadlock.game_end': undefined;

  // Win / Lose
  'deadlock.victory': undefined;
  'deadlock.defeat': undefined;

  // Combat
  'deadlock.elimination': undefined;
  'deadlock.player_eliminated': undefined;
};

export type DeadlockConditionType = keyof DeadlockConditionPropsMap;
export type DeadlockConditionProps<T extends DeadlockConditionType> = DeadlockConditionPropsMap[T];

export const DeadlockConditions: {
  [K in DeadlockConditionType]: ConditionDefinition<K>;
} = {
  'deadlock.game_start': {
    group: 'deadlock',
    name: 'game_start',
    label: 'Game Started',
    evaluate: ({ state }) => state.pendingEvents.has('game_start'),
  },

  'deadlock.game_end': {
    group: 'deadlock',
    name: 'game_end',
    label: 'Game Ended',
    evaluate: ({ state }) => state.pendingEvents.has('game_end'),
  },

  'deadlock.victory': {
    group: 'deadlock',
    name: 'victory',
    label: 'Victory',
    evaluate: ({ state }) => state.pendingEvents.has('victory'),
  },

  'deadlock.defeat': {
    group: 'deadlock',
    name: 'defeat',
    label: 'Defeat',
    evaluate: ({ state }) => state.pendingEvents.has('defeat'),
  },

  'deadlock.elimination': {
    group: 'deadlock',
    name: 'elimination',
    label: 'Enemy Eliminated',
    evaluate: ({ state }) => state.pendingEvents.has('elimination'),
  },

  'deadlock.player_eliminated': {
    group: 'deadlock',
    name: 'player_eliminated',
    label: 'Player Eliminated',
    evaluate: ({ state }) => state.pendingEvents.has('death'),
  },
} as const;

export default DeadlockConditions;
