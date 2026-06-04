import { ConditionDefinition } from '.';

export type DeadByDaylightConditionPropsMap = {
  //----------------------
  // Dead by Daylight
  //----------------------

  // Game Flow
  'dead_by_daylight.game_start': undefined;
  'dead_by_daylight.game_end': undefined;

  // Win / Lose
  'dead_by_daylight.victory': undefined;
  'dead_by_daylight.player_eliminated': undefined;

  // Combat / Events
  'dead_by_daylight.elimination': undefined;
  'dead_by_daylight.hooked_survivor': undefined;
  'dead_by_daylight.escaped': undefined;
};

export type DeadByDaylightConditionType = keyof DeadByDaylightConditionPropsMap;
export type DeadByDaylightConditionProps<
  T extends DeadByDaylightConditionType
> = DeadByDaylightConditionPropsMap[T];

export const DeadByDaylightConditions: {
  [K in DeadByDaylightConditionType]: ConditionDefinition<K>;
} = {
  'dead_by_daylight.game_start': {
    group: 'dead_by_daylight',
    name: 'game_start',
    label: 'Match Started',
    evaluate: ({ state }) => state.pendingEvents.has('game_start'),
  },

  'dead_by_daylight.game_end': {
    group: 'dead_by_daylight',
    name: 'game_end',
    label: 'Match Ended',
    evaluate: ({ state }) => state.pendingEvents.has('game_end'),
  },

  'dead_by_daylight.victory': {
    group: 'dead_by_daylight',
    name: 'victory',
    label: 'Victory',
    evaluate: ({ state }) => state.pendingEvents.has('victory'),
  },

  'dead_by_daylight.player_eliminated': {
    group: 'dead_by_daylight',
    name: 'player_eliminated',
    label: 'Player Sacrificed / Eliminated',
    evaluate: ({ state }) => state.pendingEvents.has('death'),
  },

  'dead_by_daylight.elimination': {
    group: 'dead_by_daylight',
    name: 'elimination',
    label: 'Survivor Sacrificed (Killer)',
    evaluate: ({ state }) => state.pendingEvents.has('elimination'),
  },

  'dead_by_daylight.hooked_survivor': {
    group: 'dead_by_daylight',
    name: 'hooked_survivor',
    label: 'Survivor Hooked',
    evaluate: ({ state }) => state.pendingEvents.has('hooked_survivor'),
  },

  'dead_by_daylight.escaped': {
    group: 'dead_by_daylight',
    name: 'escaped',
    label: 'Survivor Escaped',
    evaluate: ({ state }) => state.pendingEvents.has('escaped'),
  },
} as const;

export default DeadByDaylightConditions;
