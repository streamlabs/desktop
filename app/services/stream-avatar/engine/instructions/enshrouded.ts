import { EnshroudedConditionPropsMap } from "../conditions/enshrouded";
type EnshroudedInstructionType = keyof EnshroudedConditionPropsMap;

export const EnshroudedInstructions: Record<EnshroudedInstructionType, string> = {
  "enshrouded.player_eliminated": "React to {player} being eliminated in Enshrouded.",
  "enshrouded.level_up": "Celebrate {player} leveling up!",
  "enshrouded.soul_discovered": "React to {player} discovering a soul.",
  "enshrouded.quest_update": "React to {player}'s quest being updated.",
};

export default EnshroudedInstructions;
