import { ConditionDefinition } from '.';
import { onEvent, eliminationCount, playersRemaining } from './shared';

export type PubgConditionPropsMap = {
  //----------------------
  // PUBG
  //----------------------

  // Game Flow
  'pubg.game_started': undefined;
  'pubg.deployed': undefined;
  'pubg.storm_closing': undefined;
  'pubg.game_ended': undefined;

  // Player
  'pubg.victory': undefined;
  'pubg.player_eliminated': undefined;
  'pubg.player_knocked': undefined;
  'pubg.defeat': undefined;

  // Enemy
  'pubg.elimination': undefined;
  'pubg.knocked': undefined;
  'pubg.elimination_count': { elimination_count?: [number, number] };
  'pubg.players_remaining': { players_remaining?: [number, number] };
};

export type PubgConditionType = keyof PubgConditionPropsMap;
export type PubgConditionProps<T extends PubgConditionType> = PubgConditionPropsMap[T];

export const PubgConditions: {
  [K in PubgConditionType]: ConditionDefinition<K>;
} = {
  // Game Flow
  'pubg.game_started': { label: 'Game Started', evaluate: onEvent('game_start') },
  'pubg.deployed': { label: 'Deployed', evaluate: onEvent('deploy') },
  'pubg.storm_closing': { label: 'Storm Closing', evaluate: onEvent('storm_shrinking') },
  'pubg.game_ended': { label: 'Game Ended', evaluate: onEvent('game_end') },

  // Player
  'pubg.victory': { label: 'Victory', evaluate: onEvent('victory') },
  'pubg.defeat': { label: 'Defeat', evaluate: onEvent('defeat') },
  'pubg.player_eliminated': { label: 'Player Eliminated', evaluate: onEvent('death') },
  'pubg.player_knocked': { label: 'Player Knocked', evaluate: onEvent('player_knocked') },

  // Enemy
  'pubg.elimination': { label: 'Enemy Eliminated', evaluate: onEvent('elimination') },
  'pubg.knocked': { label: 'Enemy Knocked', evaluate: onEvent('knockout') },
  'pubg.elimination_count': eliminationCount(),
  'pubg.players_remaining': playersRemaining(100),
};

export default PubgConditions;
