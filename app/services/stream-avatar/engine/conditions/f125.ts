import { ConditionDefinition } from '.';

export type F125ConditionPropsMap = {
  //----------------------
  // F1 25
  //----------------------

  // Game Flow
  'f1_25.game_start': undefined;
  'f1_25.game_end': undefined;

  // Win
  'f1_25.victory': undefined;

  // Race Events
  'f1_25.position_change': undefined;
  'f1_25.lap_change': undefined;
};

export type F125ConditionType = keyof F125ConditionPropsMap;
export type F125ConditionProps<T extends F125ConditionType> = F125ConditionPropsMap[T];

export const F125Conditions: {
  [K in F125ConditionType]: ConditionDefinition<K>;
} = {
  'f1_25.game_start': {
    group: 'f1_25',
    name: 'game_start',
    label: 'Race Started',
    evaluate: ({ state }) => state.pendingEvents.has('game_start'),
  },

  'f1_25.game_end': {
    group: 'f1_25',
    name: 'game_end',
    label: 'Race Ended (Chequered Flag)',
    evaluate: ({ state }) => state.pendingEvents.has('game_end'),
  },

  'f1_25.victory': {
    group: 'f1_25',
    name: 'victory',
    label: 'Race Win (P1)',
    evaluate: ({ state }) => state.pendingEvents.has('victory'),
  },

  'f1_25.position_change': {
    group: 'f1_25',
    name: 'position_change',
    label: 'Race Position Changed',
    evaluate: ({ state }) => state.pendingEvents.has('position_change'),
  },

  'f1_25.lap_change': {
    group: 'f1_25',
    name: 'lap_change',
    label: 'New Lap Started',
    evaluate: ({ state }) => state.pendingEvents.has('lap_change'),
  },
} as const;

export default F125Conditions;
