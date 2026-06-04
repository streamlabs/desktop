import { FortniteConditionPropsMap } from "../conditions/fortnite";
type FortniteInstructionType = keyof FortniteConditionPropsMap;

export const FortniteInstructions: Record<FortniteInstructionType, string> = {
  "fortnite.game_started": "React to the game starting.",
  "fortnite.deployed": "React to {player} dropping in.",
  "fortnite.storm_closing": "Warn about the storm closing in.",
  "fortnite.game_ended": "React to the game ending.",
  "fortnite.low_health":
    "Panic about {player}'s critically low health.",
  "fortnite.has_shield": "React to {player} having shield.",
  "fortnite.no_shield":
    "Warn {player} they have no shield.",
  "fortnite.victory_royale":
    "Celebrate {player}'s Victory Royale!",
  "fortnite.player_eliminated":
    "React to {player} getting eliminated.",
  "fortnite.player_knocked":
    "React to {player} getting knocked.",
  "fortnite.defeat": "React to {player}'s defeat.",
  "fortnite.elimination": "React to the enemy being eliminated.",
  "fortnite.knocked":
    "React to {player} knocking an enemy.",
  "fortnite.elimination_count":
    "React to {player} reaching {elimination_count} eliminations.",
  "fortnite.players_remaining":
    "Comment on {players_remaining} players remaining.",
};

export default FortniteInstructions;
