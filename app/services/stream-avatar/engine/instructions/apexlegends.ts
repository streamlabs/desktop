import { ApexLegendsConditionPropsMap } from "../conditions/apexlegends";
type ApexLegendsInstructionType = keyof ApexLegendsConditionPropsMap;

export const ApexLegendsInstructions: Record<ApexLegendsInstructionType, string> = {
  "apex_legends.game_start": "React to the match starting. 8 words max.",
  "apex_legends.deploy": "React to {player} jumping from the dropship. 8 words max.",
  "apex_legends.storm_shrinking": "Warn about the ring closing. 8 words max.",
  "apex_legends.game_end": "React to the match ending. 8 words max.",
  "apex_legends.player_knocked": "React to {player} getting knocked. 8 words max.",
  "apex_legends.player_revived": "React to {player} being revived. 8 words max.",
  "apex_legends.player_eliminated": "React to {player} being eliminated. 8 words max.",
  "apex_legends.victory": "Celebrate {player}'s squad being Champion! 8 words max.",
  "apex_legends.defeat": "React to {player}'s squad being eliminated. 8 words max.",
  "apex_legends.elimination": "React to an enemy being eliminated. 8 words max.",
  "apex_legends.knockout": "React to {player} knocking an enemy. 8 words max.",
};

export default ApexLegendsInstructions;
