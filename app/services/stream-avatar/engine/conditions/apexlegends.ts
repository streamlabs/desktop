import { ConditionDefinition } from '.';

export type ApexLegendsConditionPropsMap = {
  //----------------------
  // Apex Legends
  //----------------------

  // Game Flow
  'apex_legends.game_start': undefined;
  'apex_legends.deploy': undefined;
  'apex_legends.storm_shrinking': undefined;
  'apex_legends.game_end': undefined;

  // Player
  'apex_legends.player_knocked': undefined;
  'apex_legends.player_revived': undefined;
  'apex_legends.player_eliminated': undefined;

  // Win / Lose
  'apex_legends.victory': undefined;
  'apex_legends.defeat': undefined;

  // Enemy
  'apex_legends.elimination': undefined;
  'apex_legends.knockout': undefined;
};

export type ApexLegendsConditionType = keyof ApexLegendsConditionPropsMap;
export type ApexLegendsConditionProps<
  T extends ApexLegendsConditionType
> = ApexLegendsConditionPropsMap[T];

export const ApexLegendsConditions: {
  [K in ApexLegendsConditionType]: ConditionDefinition<K>;
} = {
  'apex_legends.game_start': {
    group: 'apex_legends',
    name: 'game_start',
    label: 'Game Started',
    evaluate: ({ state }) => state.pendingEvents.has('game_start'),
  },

  'apex_legends.deploy': {
    group: 'apex_legends',
    name: 'deploy',
    label: 'Deployed',
    evaluate: ({ state }) => state.pendingEvents.has('deploy'),
  },

  'apex_legends.storm_shrinking': {
    group: 'apex_legends',
    name: 'storm_shrinking',
    label: 'Ring Closing',
    evaluate: ({ state }) => state.pendingEvents.has('storm_shrinking'),
  },

  'apex_legends.game_end': {
    group: 'apex_legends',
    name: 'game_end',
    label: 'Game Ended',
    evaluate: ({ state }) => state.pendingEvents.has('game_end'),
  },

  'apex_legends.player_knocked': {
    group: 'apex_legends',
    name: 'player_knocked',
    label: 'Player Knocked',
    evaluate: ({ state }) => state.pendingEvents.has('player_knocked'),
  },

  'apex_legends.player_revived': {
    group: 'apex_legends',
    name: 'player_revived',
    label: 'Player Revived',
    evaluate: ({ state }) => state.pendingEvents.has('player_revived'),
  },

  'apex_legends.player_eliminated': {
    group: 'apex_legends',
    name: 'player_eliminated',
    label: 'Player Eliminated',
    evaluate: ({ state }) => state.pendingEvents.has('death'),
  },

  'apex_legends.victory': {
    group: 'apex_legends',
    name: 'victory',
    label: 'Victory (Champion)',
    evaluate: ({ state }) => state.pendingEvents.has('victory'),
  },

  'apex_legends.defeat': {
    group: 'apex_legends',
    name: 'defeat',
    label: 'Defeat',
    evaluate: ({ state }) => state.pendingEvents.has('defeat'),
  },

  'apex_legends.elimination': {
    group: 'apex_legends',
    name: 'elimination',
    label: 'Enemy Eliminated',
    evaluate: ({ state }) => state.pendingEvents.has('elimination'),
  },

  'apex_legends.knockout': {
    group: 'apex_legends',
    name: 'knockout',
    label: 'Enemy Knocked',
    evaluate: ({ state }) => state.pendingEvents.has('knockout'),
  },
} as const;

export default ApexLegendsConditions;
