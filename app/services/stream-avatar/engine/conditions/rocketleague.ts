import { ConditionDefinition } from '.';
import { onEvent } from './shared';

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
  'rocket_league.game_start': { label: 'Game Started', evaluate: onEvent('game_start') },

  'rocket_league.game_end': { label: 'Game Ended', evaluate: onEvent('game_end') },

  'rocket_league.team_scored': { label: 'Team Scored', evaluate: onEvent('team_scored') },

  'rocket_league.opponent_scored': { label: 'Opponent Scored', evaluate: onEvent('opponent_scored') },

  'rocket_league.victory': { label: 'Victory', evaluate: onEvent('victory') },

  'rocket_league.defeat': { label: 'Defeat', evaluate: onEvent('defeat') },
};

export default RocketLeagueConditions;
