import { CounterStrike2ConditionPropsMap } from "../conditions/counterstrike2";
type CounterStrike2InstructionType = keyof CounterStrike2ConditionPropsMap;

export const CounterStrike2Instructions: Record<
  CounterStrike2InstructionType,
  string
> = {
  "counter_strike_2.round_started": "React to the round starting. 8 words max.",
  "counter_strike_2.first_half": "React to the first half starting. 8 words max.",
  "counter_strike_2.second_half": "React to the second half starting. 8 words max.",
  "counter_strike_2.round_won": "React to {player}'s team winning the round. 8 words max.",
  "counter_strike_2.round_lost": "React to {player}'s team losing the round. 8 words max.",
  "counter_strike_2.game_ended": "React to the match ending. 8 words max.",
  "counter_strike_2.low_health": "Panic about {player}'s low health. 8 words max.",
  "counter_strike_2.victory": "Celebrate {player}'s team winning the match. 8 words max.",
  "counter_strike_2.player_eliminated": "React to {player} being eliminated. 8 words max.",
  "counter_strike_2.defeat": "React to {player}'s team losing the match. 8 words max.",
  "counter_strike_2.elimination": "React to an enemy being eliminated. 8 words max.",
  "counter_strike_2.elimination_count":
    "React to {player} reaching {elimination_count} kills. 8 words max.",
};

export default CounterStrike2Instructions;
