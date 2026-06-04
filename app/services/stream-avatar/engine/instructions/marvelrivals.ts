import { MarvelRivalsConditionPropsMap } from "../conditions/marvelrivals";
type MarvelRivalsInstructionType = keyof MarvelRivalsConditionPropsMap;

export const MarvelRivalsInstructions: Record<MarvelRivalsInstructionType, string> = {
  "marvel_rivals.game_end": "React to the match ending. 8 words max.",
  "marvel_rivals.victory": "Celebrate {player}'s team winning! 8 words max.",
  "marvel_rivals.defeat": "React to {player}'s team losing. 8 words max.",
  "marvel_rivals.elimination": "React to a hero being eliminated. 8 words max.",
  "marvel_rivals.player_eliminated": "React to {player}'s hero being eliminated. 8 words max.",
};

export default MarvelRivalsInstructions;
