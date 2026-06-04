import { ValorantConditionPropsMap } from "../conditions/valorant";
type ValorantInstructionType = keyof ValorantConditionPropsMap;

export const ValorantInstructions: Record<ValorantInstructionType, string> = {
  "valorant.round_started": "React to the round starting. 8 words max.",
  "valorant.low_health": "Panic about {player}'s low health. 8 words max.",
  "valorant.victory": "Celebrate {player}'s team winning. 8 words max.",
  "valorant.player_eliminated": "React to {player} being eliminated. 8 words max.",
  "valorant.defeat": "React to {player}'s team losing. 8 words max.",
  "valorant.elimination": "React to an enemy being eliminated. 8 words max.",
  "valorant.elimination_count":
    "React to {player} reaching {elimination_count} kills. 8 words max.",
};

export default ValorantInstructions;
