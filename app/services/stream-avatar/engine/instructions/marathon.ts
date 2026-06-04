import { MarathonConditionPropsMap } from "../conditions/marathon";
type MarathonInstructionType = keyof MarathonConditionPropsMap;

export const MarathonInstructions: Record<MarathonInstructionType, string> = {
  "marathon.game_start": "React to the extraction mission starting.",
  "marathon.game_end": "React to the match ending.",
  "marathon.victory": "Celebrate {player} successfully exfiltrating!",
  "marathon.defeat": "React to {player} being eliminated before extraction.",
  "marathon.player_knocked": "React to {player} going down.",
  "marathon.player_eliminated": "React to {player} being eliminated.",
  "marathon.elimination": "React to an enemy runner being eliminated.",
  "marathon.knockout": "React to a runner being knocked down.",
};

export default MarathonInstructions;
