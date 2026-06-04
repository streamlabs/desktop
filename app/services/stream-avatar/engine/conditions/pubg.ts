import { Properties } from '../properties';
import { ConditionDefinition } from '.';

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
  'pubg.game_started': {
    group: 'pubg',
    name: 'game_started',
    label: 'Game Started',
    evaluate: ({ state }) => state.pendingEvents.has('game_start'),
  },

  'pubg.deployed': {
    group: 'pubg',
    name: 'deployed',
    label: 'Deployed',
    evaluate: ({ state }) => state.pendingEvents.has('deploy'),
  },

  'pubg.storm_closing': {
    group: 'pubg',
    name: 'storm_closing',
    label: 'Storm Closing',
    evaluate: ({ state }) => state.pendingEvents.has('storm_shrinking'),
  },

  'pubg.game_ended': {
    group: 'pubg',
    name: 'game_ended',
    label: 'Game Ended',
    evaluate: ({ state }) => state.pendingEvents.has('game_end'),
  },

  // Player
  'pubg.victory': {
    group: 'pubg',
    name: 'victory',
    label: 'Victory',
    evaluate: ({ state }) => state.pendingEvents.has('victory'),
  },

  'pubg.defeat': {
    group: 'pubg',
    name: 'defeat',
    label: 'Defeat',
    evaluate: ({ state }) => state.pendingEvents.has('defeat'),
  },

  'pubg.player_eliminated': {
    group: 'pubg',
    name: 'player_eliminated',
    label: 'Player Eliminated',
    evaluate: ({ state }) => state.pendingEvents.has('death'),
  },

  'pubg.player_knocked': {
    group: 'pubg',
    name: 'player_knocked',
    label: 'Player Knocked',
    evaluate: ({ state }) => state.pendingEvents.has('player_knocked'),
  },

  // Enemy
  'pubg.elimination': {
    group: 'pubg',
    name: 'elimination',
    label: 'Enemy Eliminated',
    evaluate: ({ state }) => state.pendingEvents.has('elimination'),
  },

  'pubg.knocked': {
    group: 'pubg',
    name: 'knocked',
    label: 'Enemy Knocked',
    evaluate: ({ state }) => state.pendingEvents.has('knockout'),
  },

  'pubg.elimination_count': {
    group: 'pubg',
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

  'pubg.players_remaining': {
    group: 'pubg',
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

export default PubgConditions;
