import { PubgConditionPropsMap } from "../conditions/pubg";
type PubgInstructionType = keyof PubgConditionPropsMap;

export const PubgInstructions: Record<PubgInstructionType, string> = {
  "pubg.game_started": "React to the match starting.",
  "pubg.deployed": "React to {player} parachuting in.",
  "pubg.storm_closing": "Warn about the blue zone closing.",
  "pubg.game_ended": "React to the match ending.",
  "pubg.victory": "Celebrate {player}'s chicken dinner!",
  "pubg.player_eliminated": "React to {player} being eliminated.",
  "pubg.player_knocked": "React to {player} getting knocked.",
  "pubg.defeat": "React to {player}'s defeat.",
  "pubg.elimination": "React to an enemy being eliminated.",
  "pubg.knocked": "React to {player} knocking an enemy.",
  "pubg.elimination_count":
    "React to {player} reaching {elimination_count} eliminations.",
  "pubg.players_remaining":
    "Comment on {players_remaining} players remaining.",
};

export default PubgInstructions;
