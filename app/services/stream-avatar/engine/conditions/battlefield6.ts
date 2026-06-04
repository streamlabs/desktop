import { ConditionDefinition } from '.';

export type Battlefield6ConditionPropsMap = {
  //----------------------
  // Battlefield 6
  //----------------------

  // Game Flow
  'battlefield_6.game_start': undefined;
  'battlefield_6.game_end': undefined;

  // Win / Lose
  'battlefield_6.victory': undefined;
  'battlefield_6.defeat': undefined;

  // Combat
  'battlefield_6.elimination': undefined;
  'battlefield_6.player_eliminated': undefined;
};

export type Battlefield6ConditionType = keyof Battlefield6ConditionPropsMap;
export type Battlefield6ConditionProps<
  T extends Battlefield6ConditionType
> = Battlefield6ConditionPropsMap[T];

export const Battlefield6Conditions: {
  [K in Battlefield6ConditionType]: ConditionDefinition<K>;
} = {
  'battlefield_6.game_start': {
    group: 'battlefield_6',
    name: 'game_start',
    label: 'Game Started',
    evaluate: ({ state }) => state.pendingEvents.has('game_start'),
  },

  'battlefield_6.game_end': {
    group: 'battlefield_6',
    name: 'game_end',
    label: 'Game Ended',
    evaluate: ({ state }) => state.pendingEvents.has('game_end'),
  },

  'battlefield_6.victory': {
    group: 'battlefield_6',
    name: 'victory',
    label: 'Victory',
    evaluate: ({ state }) => state.pendingEvents.has('victory'),
  },

  'battlefield_6.defeat': {
    group: 'battlefield_6',
    name: 'defeat',
    label: 'Defeat',
    evaluate: ({ state }) => state.pendingEvents.has('defeat'),
  },

  'battlefield_6.elimination': {
    group: 'battlefield_6',
    name: 'elimination',
    label: 'Enemy Eliminated',
    evaluate: ({ state }) => state.pendingEvents.has('elimination'),
  },

  'battlefield_6.player_eliminated': {
    group: 'battlefield_6',
    name: 'player_eliminated',
    label: 'Player Eliminated',
    evaluate: ({ state }) => state.pendingEvents.has('death'),
  },
} as const;

export default Battlefield6Conditions;
