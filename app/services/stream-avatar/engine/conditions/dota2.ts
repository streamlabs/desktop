import { ConditionDefinition } from '.';
import { onEvent } from './shared';

export type Dota2ConditionPropsMap = {
  //----------------------
  // Dota 2
  //----------------------

  // Game Flow
  'dota_2.game_start': undefined;
  'dota_2.game_end': undefined;

  // Win / Lose
  'dota_2.victory': undefined;
  'dota_2.defeat': undefined;

  // Combat
  'dota_2.elimination': undefined;
  'dota_2.player_eliminated': undefined;

  // Objectives
  'dota_2.tower_destroyed': undefined;
  'dota_2.glyph_used': undefined;
};

export type Dota2ConditionType = keyof Dota2ConditionPropsMap;
export type Dota2ConditionProps<T extends Dota2ConditionType> = Dota2ConditionPropsMap[T];

export const Dota2Conditions: {
  [K in Dota2ConditionType]: ConditionDefinition<K>;
} = {
  'dota_2.game_start': { label: 'Game Started', evaluate: onEvent('game_start') },

  'dota_2.game_end': { label: 'Game Ended', evaluate: onEvent('game_end') },

  'dota_2.victory': { label: 'Victory', evaluate: onEvent('victory') },

  'dota_2.defeat': { label: 'Defeat', evaluate: onEvent('defeat') },

  'dota_2.elimination': { label: 'Hero Kill', evaluate: onEvent('elimination') },

  'dota_2.player_eliminated': { label: 'Player Died', evaluate: onEvent('death') },

  'dota_2.tower_destroyed': { label: 'Tower Destroyed', evaluate: onEvent('tower_destroyed') },

  'dota_2.glyph_used': {
    label: 'Glyph of Fortification Used',
    evaluate: onEvent('glyph_used'),
  },
};

export default Dota2Conditions;
