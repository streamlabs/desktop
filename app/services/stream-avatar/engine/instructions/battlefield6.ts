import { Battlefield6ConditionPropsMap } from "../conditions/battlefield6";
type Battlefield6InstructionType = keyof Battlefield6ConditionPropsMap;

export const Battlefield6Instructions: Record<Battlefield6InstructionType, string> = {
  "battlefield_6.game_start": "React to the battle starting. 8 words max.",
  "battlefield_6.game_end": "React to the match ending. 8 words max.",
  "battlefield_6.victory": "Celebrate {player}'s team winning! 8 words max.",
  "battlefield_6.defeat": "React to {player}'s team losing. 8 words max.",
  "battlefield_6.elimination": "React to an enemy being eliminated. 8 words max.",
  "battlefield_6.player_eliminated": "React to {player} going down. 8 words max.",
};

export default Battlefield6Instructions;
