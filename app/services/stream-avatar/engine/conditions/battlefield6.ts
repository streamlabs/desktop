import { ConditionDefinition } from '.';
import { onEvent } from './shared';

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
  'battlefield_6.game_start': { label: 'Game Started', evaluate: onEvent('game_start') },

  'battlefield_6.game_end': { label: 'Game Ended', evaluate: onEvent('game_end') },

  'battlefield_6.victory': { label: 'Victory', evaluate: onEvent('victory') },

  'battlefield_6.defeat': { label: 'Defeat', evaluate: onEvent('defeat') },

  'battlefield_6.elimination': { label: 'Enemy Eliminated', evaluate: onEvent('elimination') },

  'battlefield_6.player_eliminated': { label: 'Player Eliminated', evaluate: onEvent('death') },
};

export default Battlefield6Conditions;
