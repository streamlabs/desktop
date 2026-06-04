import { ConditionDefinition } from '.';
import { onEvent } from './shared';

export type LeagueOfLegendsConditionPropsMap = {
  //----------------------
  // League of Legends
  //----------------------

  // Game Flow
  'league_of_legends.game_start': undefined;
  'league_of_legends.game_end': undefined;

  // Win / Lose
  'league_of_legends.victory': undefined;
  'league_of_legends.defeat': undefined;

  // Combat
  'league_of_legends.elimination': undefined;
  'league_of_legends.player_eliminated': undefined;

  // Objectives
  'league_of_legends.objective_ally': undefined;
  'league_of_legends.objective_enemy': undefined;
  'league_of_legends.enemy_turret_destroyed': undefined;
  'league_of_legends.ally_turret_destroyed': undefined;
};

export type LeagueOfLegendsConditionType = keyof LeagueOfLegendsConditionPropsMap;
export type LeagueOfLegendsConditionProps<
  T extends LeagueOfLegendsConditionType
> = LeagueOfLegendsConditionPropsMap[T];

export const LeagueOfLegendsConditions: {
  [K in LeagueOfLegendsConditionType]: ConditionDefinition<K>;
} = {
  'league_of_legends.game_start': { label: 'Game Started', evaluate: onEvent('game_start') },

  'league_of_legends.game_end': { label: 'Game Ended', evaluate: onEvent('game_end') },

  'league_of_legends.victory': { label: 'Victory', evaluate: onEvent('victory') },

  'league_of_legends.defeat': { label: 'Defeat', evaluate: onEvent('defeat') },

  'league_of_legends.elimination': { label: 'Champion Kill', evaluate: onEvent('elimination') },

  'league_of_legends.player_eliminated': { label: 'Player Died', evaluate: onEvent('death') },

  'league_of_legends.objective_ally': {
    label: 'Ally Team Secured Objective',
    evaluate: onEvent('objective_ally'),
  },

  'league_of_legends.objective_enemy': {
    label: 'Enemy Team Secured Objective',
    evaluate: onEvent('objective_enemy'),
  },

  'league_of_legends.enemy_turret_destroyed': {
    label: 'Enemy Turret Destroyed',
    evaluate: onEvent('enemy_turret_destroyed'),
  },

  'league_of_legends.ally_turret_destroyed': {
    label: 'Ally Turret Destroyed',
    evaluate: onEvent('ally_turret_destroyed'),
  },
};

export default LeagueOfLegendsConditions;
