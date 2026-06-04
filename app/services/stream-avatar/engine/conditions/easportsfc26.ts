import { ConditionDefinition } from '.';
import { onEvent } from './shared';

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
  'ea_sports_fc_26.game_start': { label: 'Match Started', evaluate: onEvent('game_start') },

  'ea_sports_fc_26.game_end': { label: 'Match Ended', evaluate: onEvent('game_end') },

  'ea_sports_fc_26.goal': { label: 'Goal Scored', evaluate: onEvent('goal') },

  'ea_sports_fc_26.set_piece': { label: 'Set Piece', evaluate: onEvent('set_piece') },

  'ea_sports_fc_26.halftime': { label: 'Half Time', evaluate: onEvent('halftime') },

  'ea_sports_fc_26.fulltime': { label: 'Full Time', evaluate: onEvent('fulltime') },
};

export default EaSportsFc26Conditions;
