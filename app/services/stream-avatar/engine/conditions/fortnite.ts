import { ConditionDefinition } from '.';
import { onEvent, lowHealth, hasShield, noShield, eliminationCount, playersRemaining } from './shared';

export type FortniteConditionPropsMap = {
  //----------------------
  // Fortnite
  //----------------------

  // Game Flow
  'fortnite.game_started': undefined;
  'fortnite.deployed': undefined;
  'fortnite.storm_closing': undefined;
  'fortnite.game_ended': undefined;

  // Health / Shield
  'fortnite.low_health': undefined;
  'fortnite.has_shield': undefined;
  'fortnite.no_shield': undefined;

  // Win / Lose
  'fortnite.victory_royale': undefined;
  'fortnite.player_eliminated': undefined;
  'fortnite.player_knocked': undefined;
  'fortnite.defeat': undefined;

  // Enemy
  'fortnite.elimination': undefined;
  'fortnite.knocked': undefined;
  'fortnite.elimination_count': { elimination_count?: [number, number] };
  'fortnite.players_remaining': { players_remaining?: [number, number] };
};

export type FortniteConditionType = keyof FortniteConditionPropsMap;
export type FortniteConditionProps<T extends FortniteConditionType> = FortniteConditionPropsMap[T];

export const FortniteConditions: {
  [K in FortniteConditionType]: ConditionDefinition<K>;
} = {
  // Game Flow
  'fortnite.game_started': { label: 'Game Started', evaluate: onEvent('game_start') },
  'fortnite.deployed': { label: 'Deployed', evaluate: onEvent('deploy') },
  'fortnite.game_ended': { label: 'Game Ended', evaluate: onEvent('game_end') },

  // Health / Shield
  'fortnite.low_health': { label: 'Low Health', evaluate: lowHealth },
  'fortnite.has_shield': { label: 'Has Shield', evaluate: hasShield },
  'fortnite.no_shield': { label: 'No Shield', evaluate: noShield },

  // Win / Lose
  'fortnite.victory_royale': { label: 'Victory Royale', evaluate: onEvent('victory') },
  'fortnite.defeat': { label: 'Defeat', evaluate: onEvent('defeat') },
  'fortnite.player_eliminated': { label: 'Player Eliminated', evaluate: onEvent('death') },
  'fortnite.player_knocked': { label: 'Player Knocked', evaluate: onEvent('player_knocked') },
  'fortnite.storm_closing': { label: 'Storm Closing', evaluate: onEvent('storm_shrinking') },

  // Enemy
  'fortnite.elimination': { label: 'Enemy Eliminated', evaluate: onEvent('elimination') },
  'fortnite.knocked': { label: 'Enemy Knocked', evaluate: onEvent('knockout') },
  'fortnite.elimination_count': eliminationCount(),
  'fortnite.players_remaining': playersRemaining(100),
};

export default FortniteConditions;
