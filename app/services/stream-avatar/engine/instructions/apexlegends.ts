import { ApexLegendsConditionPropsMap } from "../conditions/apexlegends";
type ApexLegendsInstructionType = keyof ApexLegendsConditionPropsMap;

export const ApexLegendsInstructions: Record<ApexLegendsInstructionType, string> = {
  "apex_legends.game_start": "React to the match starting.",
  "apex_legends.deploy": "React to {player} jumping from the dropship.",
  "apex_legends.storm_shrinking": "Warn about the ring closing.",
  "apex_legends.game_end": "React to the match ending.",
  "apex_legends.player_knocked": "React to {player} getting knocked.",
  "apex_legends.player_revived": "React to {player} being revived.",
  "apex_legends.player_eliminated": "React to {player} being eliminated.",
  "apex_legends.victory": "Celebrate {player}'s squad being Champion!",
  "apex_legends.defeat": "React to {player}'s squad being eliminated.",
  "apex_legends.elimination": "React to an enemy being eliminated.",
  "apex_legends.knockout": "React to {player} knocking an enemy.",
};

export default ApexLegendsInstructions;
