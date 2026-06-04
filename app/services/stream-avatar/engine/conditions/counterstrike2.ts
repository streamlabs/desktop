import { Properties } from '../properties';
import { ConditionDefinition } from '.';

export type CounterStrike2ConditionPropsMap = {
  //----------------------
  // Counter-Strike 2
  //----------------------

  // Game Flow
  'counter_strike_2.round_started': undefined;
  'counter_strike_2.first_half': undefined;
  'counter_strike_2.second_half': undefined;
  'counter_strike_2.round_won': undefined;
  'counter_strike_2.round_lost': undefined;
  'counter_strike_2.game_ended': undefined;

  // Health Shield
  'counter_strike_2.low_health': undefined;

  // Player
  'counter_strike_2.victory': undefined;
  'counter_strike_2.player_eliminated': undefined;
  'counter_strike_2.defeat': undefined;

  // Enemy
  'counter_strike_2.elimination': undefined;
  'counter_strike_2.elimination_count': {
    elimination_count?: [number, number];
  };
};

export type CounterStrike2ConditionType = keyof CounterStrike2ConditionPropsMap;
export type CounterStrike2ConditionProps<
  T extends CounterStrike2ConditionType
> = CounterStrike2ConditionPropsMap[T];

export const CounterStrike2Conditions: {
  [K in CounterStrike2ConditionType]: ConditionDefinition<K>;
} = {
  // Game Flow
  'counter_strike_2.round_started': {
    group: 'counter_strike_2',
    name: 'round_started',
    label: 'Round Started',
    evaluate: ({ state }) => state.pendingEvents.has('game_start'),
  },

  // Health / Shield Conditions
  'counter_strike_2.low_health': {
    group: 'counter_strike_2',
    name: 'low_health',
    label: 'Low Health',
    evaluate: ({ state }) => {
      const { health = 0 } = state;
      return health > 0 && health < 50;
    },
  },

  // Player
  'counter_strike_2.victory': {
    group: 'counter_strike_2',
    name: 'victory',
    label: 'Victory',
    evaluate: ({ state }) => state.pendingEvents.has('victory'),
  },

  'counter_strike_2.defeat': {
    group: 'counter_strike_2',
    name: 'defeat',
    label: 'Defeat',
    evaluate: ({ state }) => state.pendingEvents.has('defeat'),
  },

  'counter_strike_2.player_eliminated': {
    group: 'counter_strike_2',
    name: 'player_eliminated',
    label: 'Player Eliminated',
    evaluate: ({ state }) => state.pendingEvents.has('death'),
  },

  // Enemy
  'counter_strike_2.elimination': {
    group: 'counter_strike_2',
    name: 'elimination',
    label: 'Enemy Eliminated',
    evaluate: ({ state }) => state.pendingEvents.has('elimination'),
  },

  'counter_strike_2.elimination_count': {
    group: 'counter_strike_2',
    name: 'elimination_count',
    label: 'Enemy Elimination Count',
    properties: {
      elimination_count: new Properties.SliderRange({
        label: '# of Eliminations',
        min: 0,
        max: 50,
        default: [5, 5],
        step: 1,
      }),
    },
    evaluate: ({ state, prevState, props }) => {
      const [min, max] = props?.elimination_count ?? [5, 5];
      const { eliminations = 0 } = state;
      const { eliminations: prevEliminations = 0 } = prevState;
      return eliminations >= min && prevEliminations <= max;
    },
  },

  'counter_strike_2.first_half': {
    group: 'counter_strike_2',
    name: 'first_half',
    label: 'First Half',
    evaluate: ({ state }) => state.pendingEvents.has('first_half'),
  },

  'counter_strike_2.second_half': {
    group: 'counter_strike_2',
    name: 'second_half',
    label: 'Second Half',
    evaluate: ({ state }) => state.pendingEvents.has('second_half'),
  },

  'counter_strike_2.round_won': {
    group: 'counter_strike_2',
    name: 'round_won',
    label: 'Round Won',
    evaluate: ({ state }) => state.pendingEvents.has('round_won'),
  },

  'counter_strike_2.round_lost': {
    group: 'counter_strike_2',
    name: 'round_lost',
    label: 'Round Lost',
    evaluate: ({ state }) => state.pendingEvents.has('round_lost'),
  },

  'counter_strike_2.game_ended': {
    group: 'counter_strike_2',
    name: 'game_ended',
    label: 'Game Ended',
    evaluate: ({ state }) => state.pendingEvents.has('game_end'),
  },
} as const;

export default CounterStrike2Conditions;
