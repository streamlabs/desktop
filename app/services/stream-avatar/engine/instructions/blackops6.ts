import { BlackOps6ConditionPropsMap } from "../conditions/blackops6";

type BlackOps6InstructionType = keyof BlackOps6ConditionPropsMap;

export const BlackOps6Instructions: Record<BlackOps6InstructionType, string> = {
  "black_ops_6.elimination": "React to an enemy being eliminated.",
  "black_ops_6.victory": "Celebrate {player}'s victory!",
  "black_ops_6.defeat": "React to {player}'s defeat.",
  "black_ops_6.spectating": "React to {player} now spectating.",
};

export default BlackOps6Instructions;
