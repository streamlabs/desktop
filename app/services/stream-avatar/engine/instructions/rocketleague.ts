import { RocketLeagueConditionPropsMap } from "../conditions/rocketleague";

type RocketLeagueInstructionType = keyof RocketLeagueConditionPropsMap;

export const RocketLeagueInstructions: Record<
  RocketLeagueInstructionType,
  string
> = {
  "rocket_league.game_start": "React to the match starting.",
  "rocket_league.game_end": "React to the match ending.",
  "rocket_league.team_scored": "React to {player}'s team scoring a goal.",
  "rocket_league.opponent_scored": "React to the opponent scoring.",
  "rocket_league.victory": "Celebrate {player}'s Rocket League win!",
  "rocket_league.defeat": "React to {player}'s Rocket League loss.",
};

export default RocketLeagueInstructions;
