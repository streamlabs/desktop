import { ConditionDefinition } from '.';
import { onEvent } from './shared';

export type DeadByDaylightConditionPropsMap = {
  //----------------------
  // Dead by Daylight
  //----------------------

  // Game Flow
  'dead_by_daylight.game_start': undefined;
  'dead_by_daylight.game_end': undefined;

  // Win / Lose
  'dead_by_daylight.victory': undefined;
  'dead_by_daylight.player_eliminated': undefined;

  // Combat / Events
  'dead_by_daylight.elimination': undefined;
  'dead_by_daylight.hooked_survivor': undefined;
  'dead_by_daylight.escaped': undefined;
};

export type DeadByDaylightConditionType = keyof DeadByDaylightConditionPropsMap;
export type DeadByDaylightConditionProps<
  T extends DeadByDaylightConditionType
> = DeadByDaylightConditionPropsMap[T];

export const DeadByDaylightConditions: {
  [K in DeadByDaylightConditionType]: ConditionDefinition<K>;
} = {
  'dead_by_daylight.game_start': { label: 'Match Started', evaluate: onEvent('game_start') },

  'dead_by_daylight.game_end': { label: 'Match Ended', evaluate: onEvent('game_end') },

  'dead_by_daylight.victory': { label: 'Victory', evaluate: onEvent('victory') },

  'dead_by_daylight.player_eliminated': {
    label: 'Player Sacrificed / Eliminated',
    evaluate: onEvent('death'),
  },

  'dead_by_daylight.elimination': {
    label: 'Survivor Sacrificed (Killer)',
    evaluate: onEvent('elimination'),
  },

  'dead_by_daylight.hooked_survivor': {
    label: 'Survivor Hooked',
    evaluate: onEvent('hooked_survivor'),
  },

  'dead_by_daylight.escaped': { label: 'Survivor Escaped', evaluate: onEvent('escaped') },
};

export default DeadByDaylightConditions;
