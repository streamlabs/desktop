import { Properties } from '../properties';
import { ConditionDefinition } from '.';

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
  'fortnite.game_started': {
    group: 'fortnite',
    name: 'game_started',
    label: 'Game Started',
    evaluate: ({ state }) => state.pendingEvents.has('game_start'),
  },

  'fortnite.deployed': {
    group: 'fortnite',
    name: 'deployed',
    label: 'Deployed',
    evaluate: ({ state }) => state.pendingEvents.has('deploy'),
  },

  'fortnite.game_ended': {
    group: 'fortnite',
    name: 'game_ended',
    label: 'Game Ended',
    evaluate: ({ state }) => state.pendingEvents.has('game_end'),
  },

  // Health / Shield Conditions
  'fortnite.low_health': {
    group: 'fortnite',
    name: 'low_health',
    label: 'Low Health',
    evaluate: ({ state }) => {
      const { health = 0 } = state;
      return health > 0 && health < 50;
    },
  },

  'fortnite.has_shield': {
    group: 'fortnite',
    name: 'has_shield',
    label: 'Has Shield',
    evaluate: ({ state }) => {
      const { shield = 0 } = state;
      return shield > 0;
    },
  },

  'fortnite.no_shield': {
    group: 'fortnite',
    name: 'no_shield',
    label: 'No Shield',
    evaluate: ({ state }) => {
      const { shield = 0 } = state;
      return shield === 0;
    },
  },

  // Win / Lose Conditions
  'fortnite.victory_royale': {
    group: 'fortnite',
    name: 'victory_royale',
    label: 'Victory Royale',
    evaluate: ({ state }) => state.pendingEvents.has('victory'),
  },

  'fortnite.defeat': {
    group: 'fortnite',
    name: 'defeat',
    label: 'Defeat',
    evaluate: ({ state }) => state.pendingEvents.has('defeat'),
  },

  'fortnite.player_eliminated': {
    group: 'fortnite',
    name: 'player_eliminated',
    label: 'Player Eliminated',
    evaluate: ({ state }) => state.pendingEvents.has('death'),
  },

  'fortnite.player_knocked': {
    group: 'fortnite',
    name: 'player_knocked',
    label: 'Player Knocked',
    evaluate: ({ state }) => state.pendingEvents.has('player_knocked'),
  },

  'fortnite.storm_closing': {
    group: 'fortnite',
    name: 'storm_closing',
    label: 'Storm Closing',
    evaluate: ({ state }) => state.pendingEvents.has('storm_shrinking'),
  },

  'fortnite.elimination': {
    group: 'fortnite',
    name: 'elimination',
    label: 'Enemy Eliminated',
    evaluate: ({ state }) => state.pendingEvents.has('elimination'),
  },

  'fortnite.knocked': {
    group: 'fortnite',
    name: 'knocked',
    label: 'Enemy Knocked',
    evaluate: ({ state }) => state.pendingEvents.has('knockout'),
  },

  'fortnite.elimination_count': {
    group: 'fortnite',
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

  'fortnite.players_remaining': {
    group: 'fortnite',
    name: 'players_remaining',
    label: 'Players Remaining (coming soon)',
    disabled: true,
    properties: {
      players_remaining: new Properties.SliderRange({
        label: '# of Players Remaining',
        min: 1,
        max: 100,
        default: [1, 1],
        step: 1,
      }),
    },
    evaluate: ({ state, props }) => {
      const [min, max] = props?.players_remaining ?? [1, 1];
      const { playersRemaining = 0 } = state;
      return playersRemaining >= min && playersRemaining <= max;
    },
  },
} as const;

export default FortniteConditions;
