import { ConditionDefinition } from '.';
import { onEvent } from './shared';

export type Overwatch2ConditionPropsMap = {
  //----------------------
  // Overwatch 2
  //----------------------

  // Game Flow
  'overwatch_2.round_start': undefined;
  'overwatch_2.round_end': undefined;

  // Win / Lose
  'overwatch_2.victory': undefined;
  'overwatch_2.defeat': undefined;

  // Combat
  'overwatch_2.elimination': undefined;
  'overwatch_2.player_eliminated': undefined;
};

export type Overwatch2ConditionType = keyof Overwatch2ConditionPropsMap;
export type Overwatch2ConditionProps<
  T extends Overwatch2ConditionType
> = Overwatch2ConditionPropsMap[T];

export const Overwatch2Conditions: {
  [K in Overwatch2ConditionType]: ConditionDefinition<K>;
} = {
  'overwatch_2.round_start': { label: 'Round Started', evaluate: onEvent('game_start') },

  'overwatch_2.round_end': { label: 'Round Ended', evaluate: onEvent('game_end') },

  'overwatch_2.victory': { label: 'Victory', evaluate: onEvent('victory') },

  'overwatch_2.defeat': { label: 'Defeat', evaluate: onEvent('defeat') },

  'overwatch_2.elimination': { label: 'Elimination', evaluate: onEvent('elimination') },

  'overwatch_2.player_eliminated': { label: 'Player Eliminated', evaluate: onEvent('death') },
};

export default Overwatch2Conditions;
