import { ConditionDefinition } from '.';
import { onEvent } from './shared';

export type WarThunderConditionPropsMap = {
  //----------------------
  // War Thunder
  //----------------------

  // Combat
  'war_thunder.elimination': undefined;
};

export type WarThunderConditionType = keyof WarThunderConditionPropsMap;
export type WarThunderConditionProps<
  T extends WarThunderConditionType
> = WarThunderConditionPropsMap[T];

export const WarThunderConditions: {
  [K in WarThunderConditionType]: ConditionDefinition<K>;
} = {
  'war_thunder.elimination': { label: 'Target Destroyed', evaluate: onEvent('elimination') },
};

export default WarThunderConditions;
