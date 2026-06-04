import { ConditionDefinition } from '.';
import { onEvent } from './shared';

export type EnshroudedConditionPropsMap = {
  //----------------------
  // Enshrouded
  //----------------------

  // Player Events
  'enshrouded.player_eliminated': undefined;
  'enshrouded.level_up': undefined;

  // Exploration
  'enshrouded.soul_discovered': undefined;

  // Quests
  'enshrouded.quest_update': undefined;
};

export type EnshroudedConditionType = keyof EnshroudedConditionPropsMap;
export type EnshroudedConditionProps<
  T extends EnshroudedConditionType
> = EnshroudedConditionPropsMap[T];

export const EnshroudedConditions: {
  [K in EnshroudedConditionType]: ConditionDefinition<K>;
} = {
  'enshrouded.player_eliminated': { label: 'Player Eliminated', evaluate: onEvent('death') },

  'enshrouded.level_up': { label: 'Level Up', evaluate: onEvent('level_up') },

  'enshrouded.soul_discovered': { label: 'Soul Discovered', evaluate: onEvent('soul_discovered') },

  'enshrouded.quest_update': { label: 'Quest Updated', evaluate: onEvent('quest_update') },
};

export default EnshroudedConditions;
