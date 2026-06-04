import { DeadlockConditionPropsMap } from "../conditions/deadlock";
type DeadlockInstructionType = keyof DeadlockConditionPropsMap;

export const DeadlockInstructions: Record<DeadlockInstructionType, string> = {
  "deadlock.game_start": "React to the match starting. 8 words max.",
  "deadlock.game_end": "React to the match ending. 8 words max.",
  "deadlock.victory": "Celebrate {player}'s team winning! 8 words max.",
  "deadlock.defeat": "React to {player}'s team losing. 8 words max.",
  "deadlock.elimination": "React to an enemy hero being eliminated. 8 words max.",
  "deadlock.player_eliminated": "React to {player} being eliminated. 8 words max.",
};

export default DeadlockInstructions;
