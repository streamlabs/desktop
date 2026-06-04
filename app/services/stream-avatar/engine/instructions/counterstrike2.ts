import { CounterStrike2ConditionPropsMap } from "../conditions/counterstrike2";
type CounterStrike2InstructionType = keyof CounterStrike2ConditionPropsMap;

export const CounterStrike2Instructions: Record<
  CounterStrike2InstructionType,
  string
> = {
  "counter_strike_2.round_started": "React to the round starting.",
  "counter_strike_2.first_half": "React to the first half starting.",
  "counter_strike_2.second_half": "React to the second half starting.",
  "counter_strike_2.round_won": "React to {player}'s team winning the round.",
  "counter_strike_2.round_lost": "React to {player}'s team losing the round.",
  "counter_strike_2.game_ended": "React to the match ending.",
  "counter_strike_2.low_health": "Panic about {player}'s low health.",
  "counter_strike_2.victory": "Celebrate {player}'s team winning the match.",
  "counter_strike_2.player_eliminated": "React to {player} being eliminated.",
  "counter_strike_2.defeat": "React to {player}'s team losing the match.",
  "counter_strike_2.elimination": "React to an enemy being eliminated.",
  "counter_strike_2.elimination_count":
    "React to {player} reaching {elimination_count} kills.",
};

export default CounterStrike2Instructions;
