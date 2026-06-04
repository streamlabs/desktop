import { ConditionDefinition } from '.';
import { onEvent } from './shared';

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
  'apex_legends.game_start': { label: 'Game Started', evaluate: onEvent('game_start') },

  'apex_legends.deploy': { label: 'Deployed', evaluate: onEvent('deploy') },

  'apex_legends.storm_shrinking': { label: 'Ring Closing', evaluate: onEvent('storm_shrinking') },

  'apex_legends.game_end': { label: 'Game Ended', evaluate: onEvent('game_end') },

  'apex_legends.player_knocked': { label: 'Player Knocked', evaluate: onEvent('player_knocked') },

  'apex_legends.player_revived': { label: 'Player Revived', evaluate: onEvent('player_revived') },

  'apex_legends.player_eliminated': { label: 'Player Eliminated', evaluate: onEvent('death') },

  'apex_legends.victory': { label: 'Victory (Champion)', evaluate: onEvent('victory') },

  'apex_legends.defeat': { label: 'Defeat', evaluate: onEvent('defeat') },

  'apex_legends.elimination': { label: 'Enemy Eliminated', evaluate: onEvent('elimination') },

  'apex_legends.knockout': { label: 'Enemy Knocked', evaluate: onEvent('knockout') },
};

export default ApexLegendsConditions;
