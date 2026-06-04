import { ConditionDefinition } from '.';
import { onEvent } from './shared';

export type Nba2k26ConditionPropsMap = {
  //----------------------
  // NBA 2K26
  //----------------------

  // Game Flow
  'nba_2k26.game_start': undefined;
  'nba_2k26.game_end': undefined;

  // Match Events
  'nba_2k26.goal': undefined;
  'nba_2k26.halftime': undefined;
};

export type Nba2k26ConditionType = keyof Nba2k26ConditionPropsMap;
export type Nba2k26ConditionProps<T extends Nba2k26ConditionType> = Nba2k26ConditionPropsMap[T];

export const Nba2k26Conditions: {
  [K in Nba2k26ConditionType]: ConditionDefinition<K>;
} = {
  'nba_2k26.game_start': { label: 'Game Started', evaluate: onEvent('game_start') },

  'nba_2k26.game_end': { label: 'Game Ended (Final)', evaluate: onEvent('game_end') },

  'nba_2k26.goal': { label: 'Basket Scored', evaluate: onEvent('goal') },

  'nba_2k26.halftime': { label: 'Halftime', evaluate: onEvent('halftime') },
};

export default Nba2k26Conditions;
