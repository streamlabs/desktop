import { BlackOps6ConditionPropsMap } from "../conditions/blackops6";

type BlackOps6InstructionType = keyof BlackOps6ConditionPropsMap;

export const BlackOps6Instructions: Record<BlackOps6InstructionType, string> = {
  "black_ops_6.elimination": "React to an enemy being eliminated. 8 words max.",
  "black_ops_6.victory": "Celebrate {player}'s victory! 8 words max.",
  "black_ops_6.defeat": "React to {player}'s defeat. 8 words max.",
  "black_ops_6.spectating": "React to {player} now spectating. 8 words max.",
};

export default BlackOps6Instructions;
