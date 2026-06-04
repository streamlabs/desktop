import { ConditionDefinition } from '.';
import { onEvent } from './shared';

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
  'f1_25.game_start': { label: 'Race Started', evaluate: onEvent('game_start') },

  'f1_25.game_end': { label: 'Race Ended (Chequered Flag)', evaluate: onEvent('game_end') },

  'f1_25.victory': { label: 'Race Win (P1)', evaluate: onEvent('victory') },

  'f1_25.position_change': {
    label: 'Race Position Changed',
    evaluate: onEvent('position_change'),
  },

  'f1_25.lap_change': { label: 'New Lap Started', evaluate: onEvent('lap_change') },
};

export default F125Conditions;
