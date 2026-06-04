import { Dota2ConditionPropsMap } from "../conditions/dota2";
type Dota2InstructionType = keyof Dota2ConditionPropsMap;

export const Dota2Instructions: Record<Dota2InstructionType, string> = {
  "dota_2.game_start": "React to the match starting.",
  "dota_2.game_end": "React to the match ending.",
  "dota_2.victory": "Celebrate {player}'s team destroying the Ancient!",
  "dota_2.defeat": "React to {player}'s team losing.",
  "dota_2.elimination": "React to a hero kill.",
  "dota_2.player_eliminated": "React to {player}'s hero dying.",
  "dota_2.tower_destroyed": "React to a tower being destroyed.",
  "dota_2.glyph_used": "React to the Glyph being activated.",
};

export default Dota2Instructions;
