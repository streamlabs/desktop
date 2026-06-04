import { MarvelRivalsConditionPropsMap } from "../conditions/marvelrivals";
type MarvelRivalsInstructionType = keyof MarvelRivalsConditionPropsMap;

export const MarvelRivalsInstructions: Record<MarvelRivalsInstructionType, string> = {
  "marvel_rivals.game_end": "React to the match ending.",
  "marvel_rivals.victory": "Celebrate {player}'s team winning!",
  "marvel_rivals.defeat": "React to {player}'s team losing.",
  "marvel_rivals.elimination": "React to a hero being eliminated.",
  "marvel_rivals.player_eliminated": "React to {player}'s hero being eliminated.",
};

export default MarvelRivalsInstructions;
