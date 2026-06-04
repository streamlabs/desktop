import { Properties } from '../properties';
import { ConditionDefinition } from '.';

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
  'valorant.round_started': {
    group: 'valorant',
    name: 'round_started',
    label: 'Round Started',
    evaluate: ({ state }) => state.pendingEvents.has('game_start'),
  },

  // Health / Shield Conditions
  'valorant.low_health': {
    group: 'valorant',
    name: 'low_health',
    label: 'Low Health',
    evaluate: ({ state }) => {
      const { health = 0 } = state;
      return health > 0 && health < 50;
    },
  },

  // Player
  'valorant.victory': {
    group: 'valorant',
    name: 'victory',
    label: 'Victory',
    evaluate: ({ state }) => state.pendingEvents.has('victory'),
  },

  'valorant.defeat': {
    group: 'valorant',
    name: 'defeat',
    label: 'Defeat',
    evaluate: ({ state }) => state.pendingEvents.has('defeat'),
  },

  'valorant.player_eliminated': {
    group: 'valorant',
    name: 'player_eliminated',
    label: 'Player Eliminated',
    evaluate: ({ state }) => state.pendingEvents.has('death'),
  },

  // Enemy
  'valorant.elimination': {
    group: 'valorant',
    name: 'elimination',
    label: 'Enemy Eliminated',
    evaluate: ({ state }) => state.pendingEvents.has('elimination'),
  },

  'valorant.elimination_count': {
    group: 'valorant',
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
} as const;

export default ValorantConditions;
