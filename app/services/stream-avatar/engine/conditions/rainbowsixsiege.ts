import { ConditionDefinition } from '.';
import { onEvent } from './shared';

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
    label: 'Round Started (Preparation Phase)',
    evaluate: onEvent('game_start'),
  },

  'rainbow_six_siege.action_phase': {
    label: 'Action Phase Started',
    evaluate: onEvent('action_phase'),
  },

  'rainbow_six_siege.round_end': { label: 'Round Ended', evaluate: onEvent('game_end') },

  'rainbow_six_siege.victory': { label: 'Round Won', evaluate: onEvent('victory') },

  'rainbow_six_siege.defeat': { label: 'Round Lost', evaluate: onEvent('defeat') },

  'rainbow_six_siege.elimination': { label: 'Enemy Eliminated', evaluate: onEvent('elimination') },

  'rainbow_six_siege.player_eliminated': { label: 'Player Eliminated', evaluate: onEvent('death') },
};

export default RainbowSixSiegeConditions;
