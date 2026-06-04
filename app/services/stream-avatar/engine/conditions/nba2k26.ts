import { ConditionDefinition } from '.';

export type Nba2k26ConditionPropsMap = {
  //----------------------
  // NBA 2K26
  //----------------------

  // Game Flow
  'nba_2k26.game_start': undefined;
  'nba_2k26.game_end': undefined;

  // Match Events
  'nba_2k26.goal': undefined;
  'nba_2k26.halftime': undefined;
};

export type Nba2k26ConditionType = keyof Nba2k26ConditionPropsMap;
export type Nba2k26ConditionProps<T extends Nba2k26ConditionType> = Nba2k26ConditionPropsMap[T];

export const Nba2k26Conditions: {
  [K in Nba2k26ConditionType]: ConditionDefinition<K>;
} = {
  'nba_2k26.game_start': {
    group: 'nba_2k26',
    name: 'game_start',
    label: 'Game Started',
    evaluate: ({ state }) => state.pendingEvents.has('game_start'),
  },

  'nba_2k26.game_end': {
    group: 'nba_2k26',
    name: 'game_end',
    label: 'Game Ended (Final)',
    evaluate: ({ state }) => state.pendingEvents.has('game_end'),
  },

  'nba_2k26.goal': {
    group: 'nba_2k26',
    name: 'goal',
    label: 'Basket Scored',
    evaluate: ({ state }) => state.pendingEvents.has('goal'),
  },

  'nba_2k26.halftime': {
    group: 'nba_2k26',
    name: 'halftime',
    label: 'Halftime',
    evaluate: ({ state }) => state.pendingEvents.has('halftime'),
  },
} as const;

export default Nba2k26Conditions;
