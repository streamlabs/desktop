import { ConditionDefinition } from '.';

export type Overwatch2ConditionPropsMap = {
  //----------------------
  // Overwatch 2
  //----------------------

  // Game Flow
  'overwatch_2.round_start': undefined;
  'overwatch_2.round_end': undefined;

  // Win / Lose
  'overwatch_2.victory': undefined;
  'overwatch_2.defeat': undefined;

  // Combat
  'overwatch_2.elimination': undefined;
  'overwatch_2.player_eliminated': undefined;
};

export type Overwatch2ConditionType = keyof Overwatch2ConditionPropsMap;
export type Overwatch2ConditionProps<
  T extends Overwatch2ConditionType
> = Overwatch2ConditionPropsMap[T];

export const Overwatch2Conditions: {
  [K in Overwatch2ConditionType]: ConditionDefinition<K>;
} = {
  'overwatch_2.round_start': {
    group: 'overwatch_2',
    name: 'round_start',
    label: 'Round Started',
    evaluate: ({ state }) => state.pendingEvents.has('game_start'),
  },

  'overwatch_2.round_end': {
    group: 'overwatch_2',
    name: 'round_end',
    label: 'Round Ended',
    evaluate: ({ state }) => state.pendingEvents.has('game_end'),
  },

  'overwatch_2.victory': {
    group: 'overwatch_2',
    name: 'victory',
    label: 'Victory',
    evaluate: ({ state }) => state.pendingEvents.has('victory'),
  },

  'overwatch_2.defeat': {
    group: 'overwatch_2',
    name: 'defeat',
    label: 'Defeat',
    evaluate: ({ state }) => state.pendingEvents.has('defeat'),
  },

  'overwatch_2.elimination': {
    group: 'overwatch_2',
    name: 'elimination',
    label: 'Elimination',
    evaluate: ({ state }) => state.pendingEvents.has('elimination'),
  },

  'overwatch_2.player_eliminated': {
    group: 'overwatch_2',
    name: 'player_eliminated',
    label: 'Player Eliminated',
    evaluate: ({ state }) => state.pendingEvents.has('death'),
  },
} as const;

export default Overwatch2Conditions;
