import { F125ConditionPropsMap } from "../conditions/f125";
type F125InstructionType = keyof F125ConditionPropsMap;

export const F125Instructions: Record<F125InstructionType, string> = {
  "f1_25.game_start": "React to the race starting.",
  "f1_25.game_end": "React to {player} crossing the chequered flag.",
  "f1_25.victory": "Celebrate {player} winning the race in P1!",
  "f1_25.position_change": "React to {player}'s position changing on track.",
  "f1_25.lap_change": "React to {player} starting a new lap.",
};

export default F125Instructions;
