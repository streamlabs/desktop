import { ConditionDefinition } from '.';

export type RocketLeagueConditionPropsMap = {
  //----------------------
  // Rocket League
  //----------------------

  // Game Flow
  'rocket_league.game_start': undefined;
  'rocket_league.game_end': undefined;

  // Scoring
  'rocket_league.team_scored': undefined;
  'rocket_league.opponent_scored': undefined;

  // Win / Lose
  'rocket_league.victory': undefined;
  'rocket_league.defeat': undefined;
};

export type RocketLeagueConditionType = keyof RocketLeagueConditionPropsMap;
export type RocketLeagueConditionProps<
  T extends RocketLeagueConditionType
> = RocketLeagueConditionPropsMap[T];

export const RocketLeagueConditions: {
  [K in RocketLeagueConditionType]: ConditionDefinition<K>;
} = {
  'rocket_league.game_start': {
    group: 'rocket_league',
    name: 'game_start',
    label: 'Game Started',
    evaluate: ({ state }) => state.pendingEvents.has('game_start'),
  },

  'rocket_league.game_end': {
    group: 'rocket_league',
    name: 'game_end',
    label: 'Game Ended',
    evaluate: ({ state }) => state.pendingEvents.has('game_end'),
  },

  'rocket_league.team_scored': {
    group: 'rocket_league',
    name: 'team_scored',
    label: 'Team Scored',
    evaluate: ({ state }) => state.pendingEvents.has('team_scored'),
  },

  'rocket_league.opponent_scored': {
    group: 'rocket_league',
    name: 'opponent_scored',
    label: 'Opponent Scored',
    evaluate: ({ state }) => state.pendingEvents.has('opponent_scored'),
  },

  'rocket_league.victory': {
    group: 'rocket_league',
    name: 'victory',
    label: 'Victory',
    evaluate: ({ state }) => state.pendingEvents.has('victory'),
  },

  'rocket_league.defeat': {
    group: 'rocket_league',
    name: 'defeat',
    label: 'Defeat',
    evaluate: ({ state }) => state.pendingEvents.has('defeat'),
  },
} as const;

export default RocketLeagueConditions;
