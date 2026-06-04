import { ValorantConditionPropsMap } from "../conditions/valorant";
type ValorantInstructionType = keyof ValorantConditionPropsMap;

export const ValorantInstructions: Record<ValorantInstructionType, string> = {
  "valorant.round_started": "React to the round starting.",
  "valorant.low_health": "Panic about {player}'s low health.",
  "valorant.victory": "Celebrate {player}'s team winning.",
  "valorant.player_eliminated": "React to {player} being eliminated.",
  "valorant.defeat": "React to {player}'s team losing.",
  "valorant.elimination": "React to an enemy being eliminated.",
  "valorant.elimination_count":
    "React to {player} reaching {elimination_count} kills.",
};

export default ValorantInstructions;
