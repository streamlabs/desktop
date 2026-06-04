import { Dota2ConditionPropsMap } from "../conditions/dota2";
type Dota2InstructionType = keyof Dota2ConditionPropsMap;

export const Dota2Instructions: Record<Dota2InstructionType, string> = {
  "dota_2.game_start": "React to the match starting. 8 words max.",
  "dota_2.game_end": "React to the match ending. 8 words max.",
  "dota_2.victory": "Celebrate {player}'s team destroying the Ancient! 8 words max.",
  "dota_2.defeat": "React to {player}'s team losing. 8 words max.",
  "dota_2.elimination": "React to a hero kill. 8 words max.",
  "dota_2.player_eliminated": "React to {player}'s hero dying. 8 words max.",
  "dota_2.tower_destroyed": "React to a tower being destroyed. 8 words max.",
  "dota_2.glyph_used": "React to the Glyph being activated. 8 words max.",
};

export default Dota2Instructions;
