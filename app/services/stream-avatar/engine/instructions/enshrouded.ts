import { EnshroudedConditionPropsMap } from "../conditions/enshrouded";
type EnshroudedInstructionType = keyof EnshroudedConditionPropsMap;

export const EnshroudedInstructions: Record<EnshroudedInstructionType, string> = {
  "enshrouded.player_eliminated": "React to {player} being eliminated in Enshrouded. 8 words max.",
  "enshrouded.level_up": "Celebrate {player} leveling up! 8 words max.",
  "enshrouded.soul_discovered": "React to {player} discovering a soul. 8 words max.",
  "enshrouded.quest_update": "React to {player}'s quest being updated. 8 words max.",
};

export default EnshroudedInstructions;
