import { Battlefield6ConditionPropsMap } from "../conditions/battlefield6";
type Battlefield6InstructionType = keyof Battlefield6ConditionPropsMap;

export const Battlefield6Instructions: Record<Battlefield6InstructionType, string> = {
  "battlefield_6.game_start": "React to the battle starting.",
  "battlefield_6.game_end": "React to the match ending.",
  "battlefield_6.victory": "Celebrate {player}'s team winning!",
  "battlefield_6.defeat": "React to {player}'s team losing.",
  "battlefield_6.elimination": "React to an enemy being eliminated.",
  "battlefield_6.player_eliminated": "React to {player} going down.",
};

export default Battlefield6Instructions;
