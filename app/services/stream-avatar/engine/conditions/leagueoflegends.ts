import { ConditionDefinition } from '.';

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
  'league_of_legends.game_start': {
    group: 'league_of_legends',
    name: 'game_start',
    label: 'Game Started',
    evaluate: ({ state }) => state.pendingEvents.has('game_start'),
  },

  'league_of_legends.game_end': {
    group: 'league_of_legends',
    name: 'game_end',
    label: 'Game Ended',
    evaluate: ({ state }) => state.pendingEvents.has('game_end'),
  },

  'league_of_legends.victory': {
    group: 'league_of_legends',
    name: 'victory',
    label: 'Victory',
    evaluate: ({ state }) => state.pendingEvents.has('victory'),
  },

  'league_of_legends.defeat': {
    group: 'league_of_legends',
    name: 'defeat',
    label: 'Defeat',
    evaluate: ({ state }) => state.pendingEvents.has('defeat'),
  },

  'league_of_legends.elimination': {
    group: 'league_of_legends',
    name: 'elimination',
    label: 'Champion Kill',
    evaluate: ({ state }) => state.pendingEvents.has('elimination'),
  },

  'league_of_legends.player_eliminated': {
    group: 'league_of_legends',
    name: 'player_eliminated',
    label: 'Player Died',
    evaluate: ({ state }) => state.pendingEvents.has('death'),
  },

  'league_of_legends.objective_ally': {
    group: 'league_of_legends',
    name: 'objective_ally',
    label: 'Ally Team Secured Objective',
    evaluate: ({ state }) => state.pendingEvents.has('objective_ally'),
  },

  'league_of_legends.objective_enemy': {
    group: 'league_of_legends',
    name: 'objective_enemy',
    label: 'Enemy Team Secured Objective',
    evaluate: ({ state }) => state.pendingEvents.has('objective_enemy'),
  },

  'league_of_legends.enemy_turret_destroyed': {
    group: 'league_of_legends',
    name: 'enemy_turret_destroyed',
    label: 'Enemy Turret Destroyed',
    evaluate: ({ state }) => state.pendingEvents.has('enemy_turret_destroyed'),
  },

  'league_of_legends.ally_turret_destroyed': {
    group: 'league_of_legends',
    name: 'ally_turret_destroyed',
    label: 'Ally Turret Destroyed',
    evaluate: ({ state }) => state.pendingEvents.has('ally_turret_destroyed'),
  },
} as const;

export default LeagueOfLegendsConditions;
