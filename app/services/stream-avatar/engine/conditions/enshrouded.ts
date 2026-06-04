import { ConditionDefinition } from '.';

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
  'enshrouded.player_eliminated': {
    group: 'enshrouded',
    name: 'player_eliminated',
    label: 'Player Eliminated',
    evaluate: ({ state }) => state.pendingEvents.has('death'),
  },

  'enshrouded.level_up': {
    group: 'enshrouded',
    name: 'level_up',
    label: 'Level Up',
    evaluate: ({ state }) => state.pendingEvents.has('level_up'),
  },

  'enshrouded.soul_discovered': {
    group: 'enshrouded',
    name: 'soul_discovered',
    label: 'Soul Discovered',
    evaluate: ({ state }) => state.pendingEvents.has('soul_discovered'),
  },

  'enshrouded.quest_update': {
    group: 'enshrouded',
    name: 'quest_update',
    label: 'Quest Updated',
    evaluate: ({ state }) => state.pendingEvents.has('quest_update'),
  },
} as const;

export default EnshroudedConditions;
