import { ConditionDefinition } from '.';
import { onEvent, lowHealth, eliminationCount } from './shared';

export type CounterStrike2ConditionPropsMap = {
  //----------------------
  // Counter-Strike 2
  //----------------------

  // Game Flow
  'counter_strike_2.round_started': undefined;
  'counter_strike_2.first_half': undefined;
  'counter_strike_2.second_half': undefined;
  'counter_strike_2.round_won': undefined;
  'counter_strike_2.round_lost': undefined;
  'counter_strike_2.game_ended': undefined;

  // Health Shield
  'counter_strike_2.low_health': undefined;

  // Player
  'counter_strike_2.victory': undefined;
  'counter_strike_2.player_eliminated': undefined;
  'counter_strike_2.defeat': undefined;

  // Enemy
  'counter_strike_2.elimination': undefined;
  'counter_strike_2.elimination_count': {
    elimination_count?: [number, number];
  };
};

export type CounterStrike2ConditionType = keyof CounterStrike2ConditionPropsMap;
export type CounterStrike2ConditionProps<
  T extends CounterStrike2ConditionType
> = CounterStrike2ConditionPropsMap[T];

export const CounterStrike2Conditions: {
  [K in CounterStrike2ConditionType]: ConditionDefinition<K>;
} = {
  // Game Flow
  'counter_strike_2.round_started': { label: 'Round Started', evaluate: onEvent('game_start') },

  // Health / Shield
  'counter_strike_2.low_health': { label: 'Low Health', evaluate: lowHealth },

  // Player
  'counter_strike_2.victory': { label: 'Victory', evaluate: onEvent('victory') },
  'counter_strike_2.defeat': { label: 'Defeat', evaluate: onEvent('defeat') },
  'counter_strike_2.player_eliminated': { label: 'Player Eliminated', evaluate: onEvent('death') },

  // Enemy
  'counter_strike_2.elimination': { label: 'Enemy Eliminated', evaluate: onEvent('elimination') },
  'counter_strike_2.elimination_count': eliminationCount(),

  'counter_strike_2.first_half': { label: 'First Half', evaluate: onEvent('first_half') },
  'counter_strike_2.second_half': { label: 'Second Half', evaluate: onEvent('second_half') },
  'counter_strike_2.round_won': { label: 'Round Won', evaluate: onEvent('round_won') },
  'counter_strike_2.round_lost': { label: 'Round Lost', evaluate: onEvent('round_lost') },
  'counter_strike_2.game_ended': { label: 'Game Ended', evaluate: onEvent('game_end') },
};

export default CounterStrike2Conditions;
