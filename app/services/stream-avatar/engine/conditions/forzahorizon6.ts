import { ConditionDefinition } from '.';
import { onEvent } from './shared';

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
  'forza_horizon_6.game_start': { label: 'Race Started', evaluate: onEvent('game_start') },

  'forza_horizon_6.game_end': { label: 'Race Finished', evaluate: onEvent('game_end') },

  'forza_horizon_6.position_change': {
    label: 'Race Position Changed',
    evaluate: onEvent('position_change'),
  },

  'forza_horizon_6.lap_change': { label: 'New Lap Started', evaluate: onEvent('lap_change') },

  'forza_horizon_6.great_drift': { label: 'Great Drift', evaluate: onEvent('great_drift') },

  'forza_horizon_6.great_air': { label: 'Great Air', evaluate: onEvent('great_air') },

  'forza_horizon_6.great_skill_chain': {
    label: 'Great Skill Chain',
    evaluate: onEvent('great_skill_chain'),
  },
};

export default ForzaHorizon6Conditions;
