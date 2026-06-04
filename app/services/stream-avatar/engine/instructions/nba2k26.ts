import { Nba2k26ConditionPropsMap } from "../conditions/nba2k26";
type Nba2k26InstructionType = keyof Nba2k26ConditionPropsMap;

export const Nba2k26Instructions: Record<Nba2k26InstructionType, string> = {
  "nba_2k26.game_start": "React to the game tipping off.",
  "nba_2k26.game_end": "React to the final buzzer.",
  "nba_2k26.goal": "React to a basket being scored!",
  "nba_2k26.halftime": "React to halftime.",
};

export default Nba2k26Instructions;
