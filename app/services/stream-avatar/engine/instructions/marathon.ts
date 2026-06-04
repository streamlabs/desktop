import { MarathonConditionPropsMap } from "../conditions/marathon";
type MarathonInstructionType = keyof MarathonConditionPropsMap;

export const MarathonInstructions: Record<MarathonInstructionType, string> = {
  "marathon.game_start": "React to the extraction mission starting. 8 words max.",
  "marathon.game_end": "React to the match ending. 8 words max.",
  "marathon.victory": "Celebrate {player} successfully exfiltrating! 8 words max.",
  "marathon.defeat": "React to {player} being eliminated before extraction. 8 words max.",
  "marathon.player_knocked": "React to {player} going down. 8 words max.",
  "marathon.player_eliminated": "React to {player} being eliminated. 8 words max.",
  "marathon.elimination": "React to an enemy runner being eliminated. 8 words max.",
  "marathon.knockout": "React to a runner being knocked down. 8 words max.",
};

export default MarathonInstructions;
