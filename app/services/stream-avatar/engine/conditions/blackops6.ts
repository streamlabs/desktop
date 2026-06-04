import { ConditionDefinition } from '.';

export type BlackOps6ConditionPropsMap = {
  //----------------------
  // Call of Duty: Black Ops 6
  //----------------------

  // Player
  'black_ops_6.elimination': undefined;
  'black_ops_6.victory': undefined;
  'black_ops_6.defeat': undefined;

  // Game Flow
  'black_ops_6.spectating': undefined;
};

export type BlackOps6ConditionType = keyof BlackOps6ConditionPropsMap;
export type BlackOps6ConditionProps<
  T extends BlackOps6ConditionType
> = BlackOps6ConditionPropsMap[T];

export const BlackOps6Conditions: {
  [K in BlackOps6ConditionType]: ConditionDefinition<K>;
} = {
  'black_ops_6.elimination': {
    group: 'black_ops_6',
    name: 'elimination',
    label: 'Enemy Eliminated',
    evaluate: ({ state }) => state.pendingEvents.has('elimination'),
  },

  'black_ops_6.victory': {
    group: 'black_ops_6',
    name: 'victory',
    label: 'Victory',
    evaluate: ({ state }) => state.pendingEvents.has('victory'),
  },

  'black_ops_6.defeat': {
    group: 'black_ops_6',
    name: 'defeat',
    label: 'Defeat',
    evaluate: ({ state }) => state.pendingEvents.has('defeat'),
  },

  'black_ops_6.spectating': {
    group: 'black_ops_6',
    name: 'spectating',
    label: 'Spectating',
    evaluate: ({ state }) => state.pendingEvents.has('spectating'),
  },
} as const;

export default BlackOps6Conditions;
