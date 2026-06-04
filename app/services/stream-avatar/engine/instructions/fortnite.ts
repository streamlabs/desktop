import { FortniteConditionPropsMap } from "../conditions/fortnite";
type FortniteInstructionType = keyof FortniteConditionPropsMap;

export const FortniteInstructions: Record<FortniteInstructionType, string> = {
  "fortnite.game_started": "React to the game starting. 8 words max.",
  "fortnite.deployed": "React to {player} dropping in. 8 words max.",
  "fortnite.storm_closing": "Warn about the storm closing in. 8 words max.",
  "fortnite.game_ended": "React to the game ending. 8 words max.",
  "fortnite.low_health":
    "Panic about {player}'s critically low health. 8 words max.",
  "fortnite.has_shield": "React to {player} having shield. 8 words max.",
  "fortnite.no_shield":
    "Warn {player} they have no shield. 8 words max.",
  "fortnite.victory_royale":
    "Celebrate {player}'s Victory Royale! 8 words max.",
  "fortnite.player_eliminated":
    "React to {player} getting eliminated. 8 words max.",
  "fortnite.player_knocked":
    "React to {player} getting knocked. 8 words max.",
  "fortnite.defeat": "React to {player}'s defeat. 8 words max.",
  "fortnite.elimination": "React to the enemy being eliminated. 8 words max.",
  "fortnite.knocked":
    "React to {player} knocking an enemy. 8 words max.",
  "fortnite.elimination_count":
    "React to {player} reaching {elimination_count} eliminations. 8 words max.",
  "fortnite.players_remaining":
    "Comment on {players_remaining} players remaining. 8 words max.",
};

export default FortniteInstructions;
