import { ConditionDefinition } from '.';
import { onEvent } from './shared';

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
  'arc_raiders.game_start': { label: 'Game Started', evaluate: onEvent('game_start') },

  'arc_raiders.game_end': { label: 'Game Ended', evaluate: onEvent('game_end') },

  'arc_raiders.victory': { label: 'Victory', evaluate: onEvent('victory') },

  'arc_raiders.defeat': { label: 'Defeat', evaluate: onEvent('defeat') },

  'arc_raiders.player_knocked': { label: 'Player Knocked', evaluate: onEvent('player_knocked') },

  'arc_raiders.player_eliminated': { label: 'Player Eliminated', evaluate: onEvent('death') },

  'arc_raiders.enemy_spotted': { label: 'Enemy Spotted', evaluate: onEvent('enemy_spotted') },

  'arc_raiders.enemy_detected': { label: 'Enemy Detected', evaluate: onEvent('enemy_detected') },

  'arc_raiders.interesting_moment': {
    label: 'Interesting Moment',
    evaluate: onEvent('interesting_moment'),
  },
};

export default ArcRaidersConditions;
