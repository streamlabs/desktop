import { ConditionDefinition } from '.';

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
  'war_thunder.elimination': {
    group: 'war_thunder',
    name: 'elimination',
    label: 'Target Destroyed',
    evaluate: ({ state }) => state.pendingEvents.has('elimination'),
  },
} as const;

export default WarThunderConditions;
