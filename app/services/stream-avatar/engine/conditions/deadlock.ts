import { ConditionDefinition } from '.';
import { onEvent } from './shared';

export type DeadlockConditionPropsMap = {
  //----------------------
  // Deadlock
  //----------------------

  // Game Flow
  'deadlock.game_start': undefined;
  'deadlock.game_end': undefined;

  // Win / Lose
  'deadlock.victory': undefined;
  'deadlock.defeat': undefined;

  // Combat
  'deadlock.elimination': undefined;
  'deadlock.player_eliminated': undefined;
};

export type DeadlockConditionType = keyof DeadlockConditionPropsMap;
export type DeadlockConditionProps<T extends DeadlockConditionType> = DeadlockConditionPropsMap[T];

export const DeadlockConditions: {
  [K in DeadlockConditionType]: ConditionDefinition<K>;
} = {
  'deadlock.game_start': { label: 'Game Started', evaluate: onEvent('game_start') },

  'deadlock.game_end': { label: 'Game Ended', evaluate: onEvent('game_end') },

  'deadlock.victory': { label: 'Victory', evaluate: onEvent('victory') },

  'deadlock.defeat': { label: 'Defeat', evaluate: onEvent('defeat') },

  'deadlock.elimination': { label: 'Enemy Eliminated', evaluate: onEvent('elimination') },

  'deadlock.player_eliminated': { label: 'Player Eliminated', evaluate: onEvent('death') },
};

export default DeadlockConditions;
