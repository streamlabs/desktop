import { WarzoneConditionPropsMap } from "../conditions/warzone";
type WarzoneInstructionType = keyof WarzoneConditionPropsMap;

export const WarzoneInstructions: Record<WarzoneInstructionType, string> = {
  "warzone.deploy": "React to {player} deploying in.",
  "warzone.gulag_start": "React to {player} being sent to the Gulag.",
  "warzone.gulag_end": "React to {player}'s Gulag result.",
  "warzone.spectating": "React to {player} getting eliminated and spectating.",
  "warzone.redeploying": "React to {player} redeploying back in.",
  "warzone.victory": "Celebrate {player}'s Warzone victory!",
  "warzone.player_knocked": "React to {player} getting knocked.",
  "warzone.player_eliminated": "React to {player} being eliminated.",
  "warzone.defeat": "React to {player}'s defeat.",
  "warzone.elimination": "React to an enemy being eliminated.",
  "warzone.knockout": "React to an enemy getting knocked.",
  "warzone.elimination_count":
    "React to {player} reaching {elimination_count} eliminations.",
  "warzone.players_remaining":
    "Comment on {players_remaining} players remaining.",
};

export default WarzoneInstructions;
