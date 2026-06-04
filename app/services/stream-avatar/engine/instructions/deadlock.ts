import { DeadlockConditionPropsMap } from "../conditions/deadlock";
type DeadlockInstructionType = keyof DeadlockConditionPropsMap;

export const DeadlockInstructions: Record<DeadlockInstructionType, string> = {
  "deadlock.game_start": "React to the match starting.",
  "deadlock.game_end": "React to the match ending.",
  "deadlock.victory": "Celebrate {player}'s team winning!",
  "deadlock.defeat": "React to {player}'s team losing.",
  "deadlock.elimination": "React to an enemy hero being eliminated.",
  "deadlock.player_eliminated": "React to {player} being eliminated.",
};

export default DeadlockInstructions;
