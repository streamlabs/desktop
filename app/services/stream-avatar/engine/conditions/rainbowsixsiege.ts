import { ConditionDefinition } from '.';

export type RainbowSixSiegeConditionPropsMap = {
  //----------------------
  // Rainbow Six Siege
  //----------------------

  // Game Flow
  'rainbow_six_siege.round_start': undefined;
  'rainbow_six_siege.action_phase': undefined;
  'rainbow_six_siege.round_end': undefined;

  // Win / Lose
  'rainbow_six_siege.victory': undefined;
  'rainbow_six_siege.defeat': undefined;

  // Combat
  'rainbow_six_siege.elimination': undefined;
  'rainbow_six_siege.player_eliminated': undefined;
};

export type RainbowSixSiegeConditionType = keyof RainbowSixSiegeConditionPropsMap;
export type RainbowSixSiegeConditionProps<
  T extends RainbowSixSiegeConditionType
> = RainbowSixSiegeConditionPropsMap[T];

export const RainbowSixSiegeConditions: {
  [K in RainbowSixSiegeConditionType]: ConditionDefinition<K>;
} = {
  'rainbow_six_siege.round_start': {
    group: 'rainbow_six_siege',
    name: 'round_start',
    label: 'Round Started (Preparation Phase)',
    evaluate: ({ state }) => state.pendingEvents.has('game_start'),
  },

  'rainbow_six_siege.action_phase': {
    group: 'rainbow_six_siege',
    name: 'action_phase',
    label: 'Action Phase Started',
    evaluate: ({ state }) => state.pendingEvents.has('action_phase'),
  },

  'rainbow_six_siege.round_end': {
    group: 'rainbow_six_siege',
    name: 'round_end',
    label: 'Round Ended',
    evaluate: ({ state }) => state.pendingEvents.has('game_end'),
  },

  'rainbow_six_siege.victory': {
    group: 'rainbow_six_siege',
    name: 'victory',
    label: 'Round Won',
    evaluate: ({ state }) => state.pendingEvents.has('victory'),
  },

  'rainbow_six_siege.defeat': {
    group: 'rainbow_six_siege',
    name: 'defeat',
    label: 'Round Lost',
    evaluate: ({ state }) => state.pendingEvents.has('defeat'),
  },

  'rainbow_six_siege.elimination': {
    group: 'rainbow_six_siege',
    name: 'elimination',
    label: 'Enemy Eliminated',
    evaluate: ({ state }) => state.pendingEvents.has('elimination'),
  },

  'rainbow_six_siege.player_eliminated': {
    group: 'rainbow_six_siege',
    name: 'player_eliminated',
    label: 'Player Eliminated',
    evaluate: ({ state }) => state.pendingEvents.has('death'),
  },
} as const;

export default RainbowSixSiegeConditions;
