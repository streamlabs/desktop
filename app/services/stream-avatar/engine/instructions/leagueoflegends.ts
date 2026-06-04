import { LeagueOfLegendsConditionPropsMap } from "../conditions/leagueoflegends";
type LeagueOfLegendsInstructionType = keyof LeagueOfLegendsConditionPropsMap;

export const LeagueOfLegendsInstructions: Record<LeagueOfLegendsInstructionType, string> = {
  "league_of_legends.game_start": "React to minions spawning and the match starting.",
  "league_of_legends.game_end": "React to the match ending.",
  "league_of_legends.victory": "Celebrate {player}'s team destroying the Nexus!",
  "league_of_legends.defeat": "React to {player}'s team losing.",
  "league_of_legends.elimination": "React to {player} getting a kill.",
  "league_of_legends.player_eliminated": "React to {player}'s champion dying.",
  "league_of_legends.objective_ally": "React to {player}'s team securing an objective.",
  "league_of_legends.objective_enemy": "React to the enemy stealing an objective.",
  "league_of_legends.enemy_turret_destroyed": "React to an enemy turret falling.",
  "league_of_legends.ally_turret_destroyed": "React to an ally turret being lost.",
};

export default LeagueOfLegendsInstructions;
