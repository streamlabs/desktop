import { ConditionDefinition } from '.';

export type ArcRaidersConditionPropsMap = {
  //----------------------
  // Arc Raiders
  //----------------------

  // Game Flow
  'arc_raiders.game_start': undefined;
  'arc_raiders.game_end': undefined;

  // Win / Lose
  'arc_raiders.victory': undefined;
  'arc_raiders.defeat': undefined;

  // Player
  'arc_raiders.player_knocked': undefined;
  'arc_raiders.player_eliminated': undefined;

  // Enemy
  'arc_raiders.enemy_spotted': undefined;
  'arc_raiders.enemy_detected': undefined;

  // Moments
  'arc_raiders.interesting_moment': undefined;
};

export type ArcRaidersConditionType = keyof ArcRaidersConditionPropsMap;
export type ArcRaidersConditionProps<
  T extends ArcRaidersConditionType
> = ArcRaidersConditionPropsMap[T];

export const ArcRaidersConditions: {
  [K in ArcRaidersConditionType]: ConditionDefinition<K>;
} = {
  'arc_raiders.game_start': {
    group: 'arc_raiders',
    name: 'game_start',
    label: 'Game Started',
    evaluate: ({ state }) => state.pendingEvents.has('game_start'),
  },

  'arc_raiders.game_end': {
    group: 'arc_raiders',
    name: 'game_end',
    label: 'Game Ended',
    evaluate: ({ state }) => state.pendingEvents.has('game_end'),
  },

  'arc_raiders.victory': {
    group: 'arc_raiders',
    name: 'victory',
    label: 'Victory',
    evaluate: ({ state }) => state.pendingEvents.has('victory'),
  },

  'arc_raiders.defeat': {
    group: 'arc_raiders',
    name: 'defeat',
    label: 'Defeat',
    evaluate: ({ state }) => state.pendingEvents.has('defeat'),
  },

  'arc_raiders.player_knocked': {
    group: 'arc_raiders',
    name: 'player_knocked',
    label: 'Player Knocked',
    evaluate: ({ state }) => state.pendingEvents.has('player_knocked'),
  },

  'arc_raiders.player_eliminated': {
    group: 'arc_raiders',
    name: 'player_eliminated',
    label: 'Player Eliminated',
    evaluate: ({ state }) => state.pendingEvents.has('death'),
  },

  'arc_raiders.enemy_spotted': {
    group: 'arc_raiders',
    name: 'enemy_spotted',
    label: 'Enemy Spotted',
    evaluate: ({ state }) => state.pendingEvents.has('enemy_spotted'),
  },

  'arc_raiders.enemy_detected': {
    group: 'arc_raiders',
    name: 'enemy_detected',
    label: 'Enemy Detected',
    evaluate: ({ state }) => state.pendingEvents.has('enemy_detected'),
  },

  'arc_raiders.interesting_moment': {
    group: 'arc_raiders',
    name: 'interesting_moment',
    label: 'Interesting Moment',
    evaluate: ({ state }) => state.pendingEvents.has('interesting_moment'),
  },
} as const;

export default ArcRaidersConditions;
