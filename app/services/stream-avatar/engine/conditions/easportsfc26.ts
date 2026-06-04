import { ConditionDefinition } from '.';

export type EaSportsFc26ConditionPropsMap = {
  //----------------------
  // EA Sports FC 26
  //----------------------

  // Game Flow
  'ea_sports_fc_26.game_start': undefined;
  'ea_sports_fc_26.game_end': undefined;

  // Match Events
  'ea_sports_fc_26.goal': undefined;
  'ea_sports_fc_26.set_piece': undefined;
  'ea_sports_fc_26.halftime': undefined;
  'ea_sports_fc_26.fulltime': undefined;
};

export type EaSportsFc26ConditionType = keyof EaSportsFc26ConditionPropsMap;
export type EaSportsFc26ConditionProps<
  T extends EaSportsFc26ConditionType
> = EaSportsFc26ConditionPropsMap[T];

export const EaSportsFc26Conditions: {
  [K in EaSportsFc26ConditionType]: ConditionDefinition<K>;
} = {
  'ea_sports_fc_26.game_start': {
    group: 'ea_sports_fc_26',
    name: 'game_start',
    label: 'Match Started',
    evaluate: ({ state }) => state.pendingEvents.has('game_start'),
  },

  'ea_sports_fc_26.game_end': {
    group: 'ea_sports_fc_26',
    name: 'game_end',
    label: 'Match Ended',
    evaluate: ({ state }) => state.pendingEvents.has('game_end'),
  },

  'ea_sports_fc_26.goal': {
    group: 'ea_sports_fc_26',
    name: 'goal',
    label: 'Goal Scored',
    evaluate: ({ state }) => state.pendingEvents.has('goal'),
  },

  'ea_sports_fc_26.set_piece': {
    group: 'ea_sports_fc_26',
    name: 'set_piece',
    label: 'Set Piece',
    evaluate: ({ state }) => state.pendingEvents.has('set_piece'),
  },

  'ea_sports_fc_26.halftime': {
    group: 'ea_sports_fc_26',
    name: 'halftime',
    label: 'Half Time',
    evaluate: ({ state }) => state.pendingEvents.has('halftime'),
  },

  'ea_sports_fc_26.fulltime': {
    group: 'ea_sports_fc_26',
    name: 'fulltime',
    label: 'Full Time',
    evaluate: ({ state }) => state.pendingEvents.has('fulltime'),
  },
} as const;

export default EaSportsFc26Conditions;
