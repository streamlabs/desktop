import { Properties } from '../properties';
import { ConditionDefinition } from '.';

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
  'warzone.deploy': {
    group: 'warzone',
    name: 'deploy',
    label: 'Deploy',
    evaluate: ({ state }) => state.pendingEvents.has('deploy'),
  },

  'warzone.elimination': {
    group: 'warzone',
    name: 'elimination',
    label: 'Enemy Eliminated',
    evaluate: ({ state }) => state.pendingEvents.has('elimination'),
  },

  'warzone.knockout': {
    group: 'warzone',
    name: 'knockout',
    label: 'Enemy Downed',
    evaluate: ({ state }) => state.pendingEvents.has('knockout'),
  },

  'warzone.player_knocked': {
    group: 'warzone',
    name: 'player_knocked',
    label: 'Player Downed',
    evaluate: ({ state }) => state.pendingEvents.has('player_knocked'),
  },

  'warzone.player_eliminated': {
    group: 'warzone',
    name: 'player_eliminated',
    label: 'Player Eliminated',
    evaluate: ({ state }) => state.pendingEvents.has('death'),
  },

  'warzone.victory': {
    group: 'warzone',
    name: 'victory',
    label: 'Victory',
    evaluate: ({ state }) => state.pendingEvents.has('victory'),
  },

  'warzone.defeat': {
    group: 'warzone',
    name: 'defeat',
    label: 'Defeat',
    evaluate: ({ state }) => state.pendingEvents.has('defeat'),
  },

  'warzone.gulag_start': {
    group: 'warzone',
    name: 'gulag_start',
    label: 'Gulag Started',
    evaluate: ({ state }) => state.pendingEvents.has('gulag_start'),
  },

  'warzone.gulag_end': {
    group: 'warzone',
    name: 'gulag_end',
    label: 'Gulag Ended',
    evaluate: ({ state }) => state.pendingEvents.has('gulag_end'),
  },

  'warzone.spectating': {
    group: 'warzone',
    name: 'spectating',
    label: 'Spectating',
    evaluate: ({ state }) => state.pendingEvents.has('spectating'),
  },

  'warzone.redeploying': {
    group: 'warzone',
    name: 'redeploying',
    label: 'Redeploying',
    evaluate: ({ state }) => state.pendingEvents.has('redeploying'),
  },

  'warzone.elimination_count': {
    group: 'warzone',
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

  'warzone.players_remaining': {
    group: 'warzone',
    name: 'players_remaining',
    label: 'Players Remaining (coming soon)',
    disabled: true,
    properties: {
      players_remaining: new Properties.SliderRange({
        label: '# of Players Remaining',
        min: 1,
        max: 150,
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

export default WarzoneConditions;
