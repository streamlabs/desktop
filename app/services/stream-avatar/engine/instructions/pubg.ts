import { PubgConditionPropsMap } from "../conditions/pubg";
type PubgInstructionType = keyof PubgConditionPropsMap;

export const PubgInstructions: Record<PubgInstructionType, string> = {
  "pubg.game_started": "React to the match starting. 8 words max.",
  "pubg.deployed": "React to {player} parachuting in. 8 words max.",
  "pubg.storm_closing": "Warn about the blue zone closing. 8 words max.",
  "pubg.game_ended": "React to the match ending. 8 words max.",
  "pubg.victory": "Celebrate {player}'s chicken dinner! 8 words max.",
  "pubg.player_eliminated": "React to {player} being eliminated. 8 words max.",
  "pubg.player_knocked": "React to {player} getting knocked. 8 words max.",
  "pubg.defeat": "React to {player}'s defeat. 8 words max.",
  "pubg.elimination": "React to an enemy being eliminated. 8 words max.",
  "pubg.knocked": "React to {player} knocking an enemy. 8 words max.",
  "pubg.elimination_count":
    "React to {player} reaching {elimination_count} eliminations. 8 words max.",
  "pubg.players_remaining":
    "Comment on {players_remaining} players remaining. 8 words max.",
};

export default PubgInstructions;
