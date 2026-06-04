import { RocketLeagueConditionPropsMap } from "../conditions/rocketleague";

type RocketLeagueInstructionType = keyof RocketLeagueConditionPropsMap;

export const RocketLeagueInstructions: Record<
  RocketLeagueInstructionType,
  string
> = {
  "rocket_league.game_start": "React to the match starting. 8 words max.",
  "rocket_league.game_end": "React to the match ending. 8 words max.",
  "rocket_league.team_scored": "React to {player}'s team scoring a goal. 8 words max.",
  "rocket_league.opponent_scored": "React to the opponent scoring. 8 words max.",
  "rocket_league.victory": "Celebrate {player}'s Rocket League win! 8 words max.",
  "rocket_league.defeat": "React to {player}'s Rocket League loss. 8 words max.",
};

export default RocketLeagueInstructions;
