import { Overwatch2ConditionPropsMap } from "../conditions/overwatch2";
type Overwatch2InstructionType = keyof Overwatch2ConditionPropsMap;

export const Overwatch2Instructions: Record<Overwatch2InstructionType, string> = {
  "overwatch_2.round_start": "React to the round starting. 8 words max.",
  "overwatch_2.round_end": "React to the round ending. 8 words max.",
  "overwatch_2.victory": "Celebrate {player}'s team winning! 8 words max.",
  "overwatch_2.defeat": "React to {player}'s team losing. 8 words max.",
  "overwatch_2.elimination": "React to an enemy being eliminated. 8 words max.",
  "overwatch_2.player_eliminated": "React to {player} being eliminated. 8 words max.",
};

export default Overwatch2Instructions;
