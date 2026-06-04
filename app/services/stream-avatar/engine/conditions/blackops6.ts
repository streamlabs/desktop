import { ConditionDefinition } from '.';
import { onEvent } from './shared';

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
  'black_ops_6.elimination': { label: 'Enemy Eliminated', evaluate: onEvent('elimination') },

  'black_ops_6.victory': { label: 'Victory', evaluate: onEvent('victory') },

  'black_ops_6.defeat': { label: 'Defeat', evaluate: onEvent('defeat') },

  'black_ops_6.spectating': { label: 'Spectating', evaluate: onEvent('spectating') },
};

export default BlackOps6Conditions;
