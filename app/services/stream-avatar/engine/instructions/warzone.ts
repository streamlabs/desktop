import { WarzoneConditionPropsMap } from "../conditions/warzone";
type WarzoneInstructionType = keyof WarzoneConditionPropsMap;

export const WarzoneInstructions: Record<WarzoneInstructionType, string> = {
  "warzone.deploy": "React to {player} deploying in. 8 words max.",
  "warzone.gulag_start": "React to {player} being sent to the Gulag. 8 words max.",
  "warzone.gulag_end": "React to {player}'s Gulag result. 8 words max.",
  "warzone.spectating": "React to {player} getting eliminated and spectating. 8 words max.",
  "warzone.redeploying": "React to {player} redeploying back in. 8 words max.",
  "warzone.victory": "Celebrate {player}'s Warzone victory! 8 words max.",
  "warzone.player_knocked": "React to {player} getting knocked. 8 words max.",
  "warzone.player_eliminated": "React to {player} being eliminated. 8 words max.",
  "warzone.defeat": "React to {player}'s defeat. 8 words max.",
  "warzone.elimination": "React to an enemy being eliminated. 8 words max.",
  "warzone.knockout": "React to an enemy getting knocked. 8 words max.",
  "warzone.elimination_count":
    "React to {player} reaching {elimination_count} eliminations. 8 words max.",
  "warzone.players_remaining":
    "Comment on {players_remaining} players remaining. 8 words max.",
};

export default WarzoneInstructions;
