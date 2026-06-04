import { ConditionDefinition } from '.';
import { onEvent, lowHealth, eliminationCount } from './shared';

export type ValorantConditionPropsMap = {
  //----------------------
  // Valorant
  //----------------------

  // Game Flow
  'valorant.round_started': undefined;

  // Health Shield
  'valorant.low_health': undefined;

  // Player
  'valorant.victory': undefined;
  'valorant.player_eliminated': undefined;
  'valorant.defeat': undefined;

  // Enemy
  'valorant.elimination': undefined;
  'valorant.elimination_count': { elimination_count?: [number, number] };
};

export type ValorantConditionType = keyof ValorantConditionPropsMap;
export type ValorantConditionProps<T extends ValorantConditionType> = ValorantConditionPropsMap[T];

export const ValorantConditions: {
  [K in ValorantConditionType]: ConditionDefinition<K>;
} = {
  // Game Flow
  'valorant.round_started': { label: 'Round Started', evaluate: onEvent('game_start') },

  // Health / Shield
  'valorant.low_health': { label: 'Low Health', evaluate: lowHealth },

  // Player
  'valorant.victory': { label: 'Victory', evaluate: onEvent('victory') },
  'valorant.defeat': { label: 'Defeat', evaluate: onEvent('defeat') },
  'valorant.player_eliminated': { label: 'Player Eliminated', evaluate: onEvent('death') },

  // Enemy
  'valorant.elimination': { label: 'Enemy Eliminated', evaluate: onEvent('elimination') },
  'valorant.elimination_count': eliminationCount(),
};

export default ValorantConditions;
