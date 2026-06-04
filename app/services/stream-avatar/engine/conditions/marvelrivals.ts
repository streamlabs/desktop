import { ConditionDefinition } from '.';
import { onEvent } from './shared';

export type MarvelRivalsConditionPropsMap = {
  //----------------------
  // Marvel Rivals
  //----------------------

  // Game Flow
  'marvel_rivals.game_end': undefined;

  // Win / Lose
  'marvel_rivals.victory': undefined;
  'marvel_rivals.defeat': undefined;

  // Combat
  'marvel_rivals.elimination': undefined;
  'marvel_rivals.player_eliminated': undefined;
};

export type MarvelRivalsConditionType = keyof MarvelRivalsConditionPropsMap;
export type MarvelRivalsConditionProps<
  T extends MarvelRivalsConditionType
> = MarvelRivalsConditionPropsMap[T];

export const MarvelRivalsConditions: {
  [K in MarvelRivalsConditionType]: ConditionDefinition<K>;
} = {
  'marvel_rivals.game_end': { label: 'Match Ended', evaluate: onEvent('game_end') },

  'marvel_rivals.victory': { label: 'Victory', evaluate: onEvent('victory') },

  'marvel_rivals.defeat': { label: 'Defeat', evaluate: onEvent('defeat') },

  'marvel_rivals.elimination': { label: 'Hero Eliminated', evaluate: onEvent('elimination') },

  'marvel_rivals.player_eliminated': { label: 'Player Eliminated', evaluate: onEvent('death') },
};

export default MarvelRivalsConditions;
