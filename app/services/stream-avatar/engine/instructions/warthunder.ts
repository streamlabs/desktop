import { WarThunderConditionPropsMap } from "../conditions/warthunder";
type WarThunderInstructionType = keyof WarThunderConditionPropsMap;

export const WarThunderInstructions: Record<WarThunderInstructionType, string> = {
  "war_thunder.elimination": "React to {player} destroying an enemy. 8 words max.",
};

export default WarThunderInstructions;
