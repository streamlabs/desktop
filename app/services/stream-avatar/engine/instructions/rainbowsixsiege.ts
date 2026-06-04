import { RainbowSixSiegeConditionPropsMap } from "../conditions/rainbowsixsiege";
type RainbowSixSiegeInstructionType = keyof RainbowSixSiegeConditionPropsMap;

export const RainbowSixSiegeInstructions: Record<RainbowSixSiegeInstructionType, string> = {
  "rainbow_six_siege.round_start": "React to the preparation phase starting.",
  "rainbow_six_siege.action_phase": "React to the action phase beginning.",
  "rainbow_six_siege.round_end": "React to the round ending.",
  "rainbow_six_siege.victory": "React to {player}'s team winning the round.",
  "rainbow_six_siege.defeat": "React to {player}'s team losing the round.",
  "rainbow_six_siege.elimination": "React to an enemy operator being eliminated.",
  "rainbow_six_siege.player_eliminated": "React to {player} being eliminated.",
};

export default RainbowSixSiegeInstructions;
