import { LeagueOfLegendsConditionPropsMap } from "../conditions/leagueoflegends";
type LeagueOfLegendsInstructionType = keyof LeagueOfLegendsConditionPropsMap;

export const LeagueOfLegendsInstructions: Record<LeagueOfLegendsInstructionType, string> = {
  "league_of_legends.game_start": "React to minions spawning and the match starting. 8 words max.",
  "league_of_legends.game_end": "React to the match ending. 8 words max.",
  "league_of_legends.victory": "Celebrate {player}'s team destroying the Nexus! 8 words max.",
  "league_of_legends.defeat": "React to {player}'s team losing. 8 words max.",
  "league_of_legends.elimination": "React to {player} getting a kill. 8 words max.",
  "league_of_legends.player_eliminated": "React to {player}'s champion dying. 8 words max.",
  "league_of_legends.objective_ally": "React to {player}'s team securing an objective. 8 words max.",
  "league_of_legends.objective_enemy": "React to the enemy stealing an objective. 8 words max.",
  "league_of_legends.enemy_turret_destroyed": "React to an enemy turret falling. 8 words max.",
  "league_of_legends.ally_turret_destroyed": "React to an ally turret being lost. 8 words max.",
};

export default LeagueOfLegendsInstructions;
