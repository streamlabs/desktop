import { ConditionDefinition } from '.';
import { onEvent, eliminationCount, playersRemaining } from './shared';

export type WarzoneConditionPropsMap = {
  //----------------------
  // Warzone
  //----------------------

  // Game Flow
  'warzone.deploy': undefined;
  'warzone.gulag_start': undefined;
  'warzone.gulag_end': undefined;
  'warzone.spectating': undefined;
  'warzone.redeploying': undefined;

  // Player
  'warzone.victory': undefined;
  'warzone.player_knocked': undefined;
  'warzone.player_eliminated': undefined;
  'warzone.defeat': undefined;

  // Enemy
  'warzone.elimination': undefined;
  'warzone.knockout': undefined;
  'warzone.elimination_count': { elimination_count?: [number, number] };
  'warzone.players_remaining': { players_remaining?: [number, number] };
};

export type WarzoneConditionType = keyof WarzoneConditionPropsMap;
export type WarzoneConditionProps<T extends WarzoneConditionType> = WarzoneConditionPropsMap[T];

export const WarzoneConditions: {
  [K in WarzoneConditionType]: ConditionDefinition<K>;
} = {
  'warzone.deploy': { label: 'Deploy', evaluate: onEvent('deploy') },
  'warzone.elimination': { label: 'Enemy Eliminated', evaluate: onEvent('elimination') },
  'warzone.knockout': { label: 'Enemy Downed', evaluate: onEvent('knockout') },
  'warzone.player_knocked': { label: 'Player Downed', evaluate: onEvent('player_knocked') },
  'warzone.player_eliminated': { label: 'Player Eliminated', evaluate: onEvent('death') },
  'warzone.victory': { label: 'Victory', evaluate: onEvent('victory') },
  'warzone.defeat': { label: 'Defeat', evaluate: onEvent('defeat') },
  'warzone.gulag_start': { label: 'Gulag Started', evaluate: onEvent('gulag_start') },
  'warzone.gulag_end': { label: 'Gulag Ended', evaluate: onEvent('gulag_end') },
  'warzone.spectating': { label: 'Spectating', evaluate: onEvent('spectating') },
  'warzone.redeploying': { label: 'Redeploying', evaluate: onEvent('redeploying') },
  'warzone.elimination_count': eliminationCount(),
  'warzone.players_remaining': playersRemaining(150),
};

export default WarzoneConditions;
