import { RainbowSixSiegeConditionPropsMap } from "../conditions/rainbowsixsiege";
type RainbowSixSiegeInstructionType = keyof RainbowSixSiegeConditionPropsMap;

export const RainbowSixSiegeInstructions: Record<RainbowSixSiegeInstructionType, string> = {
  "rainbow_six_siege.round_start": "React to the preparation phase starting. 8 words max.",
  "rainbow_six_siege.action_phase": "React to the action phase beginning. 8 words max.",
  "rainbow_six_siege.round_end": "React to the round ending. 8 words max.",
  "rainbow_six_siege.victory": "React to {player}'s team winning the round. 8 words max.",
  "rainbow_six_siege.defeat": "React to {player}'s team losing the round. 8 words max.",
  "rainbow_six_siege.elimination": "React to an enemy operator being eliminated. 8 words max.",
  "rainbow_six_siege.player_eliminated": "React to {player} being eliminated. 8 words max.",
};

export default RainbowSixSiegeInstructions;
