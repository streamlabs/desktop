import { ConditionDefinition } from '.';
import { onEvent } from './shared';

export type MarathonConditionPropsMap = {
  //----------------------
  // Marathon
  //----------------------

  // Game Flow
  'marathon.game_start': undefined;
  'marathon.game_end': undefined;

  // Win / Lose
  'marathon.victory': undefined;
  'marathon.defeat': undefined;

  // Player
  'marathon.player_knocked': undefined;
  'marathon.player_eliminated': undefined;

  // Enemy
  'marathon.elimination': undefined;
  'marathon.knockout': undefined;
};

export type MarathonConditionType = keyof MarathonConditionPropsMap;
export type MarathonConditionProps<T extends MarathonConditionType> = MarathonConditionPropsMap[T];

export const MarathonConditions: {
  [K in MarathonConditionType]: ConditionDefinition<K>;
} = {
  'marathon.game_start': { label: 'Match Started', evaluate: onEvent('game_start') },

  'marathon.game_end': { label: 'Match Ended', evaluate: onEvent('game_end') },

  'marathon.victory': { label: 'Exfiltrated (Victory)', evaluate: onEvent('victory') },

  'marathon.defeat': { label: 'Eliminated (Defeat)', evaluate: onEvent('defeat') },

  'marathon.player_knocked': { label: 'Player Knocked', evaluate: onEvent('player_knocked') },

  'marathon.player_eliminated': { label: 'Player Eliminated', evaluate: onEvent('death') },

  'marathon.elimination': { label: 'Runner Eliminated', evaluate: onEvent('elimination') },

  'marathon.knockout': { label: 'Runner Knocked', evaluate: onEvent('knockout') },
};

export default MarathonConditions;
