import { ConditionDefinition } from '.';

export type ForzaHorizon6ConditionPropsMap = {
  //----------------------
  // Forza Horizon 6
  //----------------------

  // Game Flow
  'forza_horizon_6.game_start': undefined;
  'forza_horizon_6.game_end': undefined;

  // Race Events
  'forza_horizon_6.position_change': undefined;
  'forza_horizon_6.lap_change': undefined;

  // Skill Events
  'forza_horizon_6.great_drift': undefined;
  'forza_horizon_6.great_air': undefined;
  'forza_horizon_6.great_skill_chain': undefined;
};

export type ForzaHorizon6ConditionType = keyof ForzaHorizon6ConditionPropsMap;
export type ForzaHorizon6ConditionProps<
  T extends ForzaHorizon6ConditionType
> = ForzaHorizon6ConditionPropsMap[T];

export const ForzaHorizon6Conditions: {
  [K in ForzaHorizon6ConditionType]: ConditionDefinition<K>;
} = {
  'forza_horizon_6.game_start': {
    group: 'forza_horizon_6',
    name: 'game_start',
    label: 'Race Started',
    evaluate: ({ state }) => state.pendingEvents.has('game_start'),
  },

  'forza_horizon_6.game_end': {
    group: 'forza_horizon_6',
    name: 'game_end',
    label: 'Race Finished',
    evaluate: ({ state }) => state.pendingEvents.has('game_end'),
  },

  'forza_horizon_6.position_change': {
    group: 'forza_horizon_6',
    name: 'position_change',
    label: 'Race Position Changed',
    evaluate: ({ state }) => state.pendingEvents.has('position_change'),
  },

  'forza_horizon_6.lap_change': {
    group: 'forza_horizon_6',
    name: 'lap_change',
    label: 'New Lap Started',
    evaluate: ({ state }) => state.pendingEvents.has('lap_change'),
  },

  'forza_horizon_6.great_drift': {
    group: 'forza_horizon_6',
    name: 'great_drift',
    label: 'Great Drift',
    evaluate: ({ state }) => state.pendingEvents.has('great_drift'),
  },

  'forza_horizon_6.great_air': {
    group: 'forza_horizon_6',
    name: 'great_air',
    label: 'Great Air',
    evaluate: ({ state }) => state.pendingEvents.has('great_air'),
  },

  'forza_horizon_6.great_skill_chain': {
    group: 'forza_horizon_6',
    name: 'great_skill_chain',
    label: 'Great Skill Chain',
    evaluate: ({ state }) => state.pendingEvents.has('great_skill_chain'),
  },
} as const;

export default ForzaHorizon6Conditions;
