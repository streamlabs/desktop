import { Overwatch2ConditionPropsMap } from "../conditions/overwatch2";
type Overwatch2InstructionType = keyof Overwatch2ConditionPropsMap;

export const Overwatch2Instructions: Record<Overwatch2InstructionType, string> = {
  "overwatch_2.round_start": "React to the round starting.",
  "overwatch_2.round_end": "React to the round ending.",
  "overwatch_2.victory": "Celebrate {player}'s team winning!",
  "overwatch_2.defeat": "React to {player}'s team losing.",
  "overwatch_2.elimination": "React to an enemy being eliminated.",
  "overwatch_2.player_eliminated": "React to {player} being eliminated.",
};

export default Overwatch2Instructions;
