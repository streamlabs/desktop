import { EaSportsFc26ConditionPropsMap } from "../conditions/easportsfc26";
type EaSportsFc26InstructionType = keyof EaSportsFc26ConditionPropsMap;

export const EaSportsFc26Instructions: Record<EaSportsFc26InstructionType, string> = {
  "ea_sports_fc_26.game_start": "React to the match kicking off. 8 words max.",
  "ea_sports_fc_26.game_end": "React to the final whistle. 8 words max.",
  "ea_sports_fc_26.goal": "React to a goal being scored! 8 words max.",
  "ea_sports_fc_26.set_piece": "React to a set piece opportunity. 8 words max.",
  "ea_sports_fc_26.halftime": "React to halftime. 8 words max.",
  "ea_sports_fc_26.fulltime": "React to the full time whistle. 8 words max.",
};

export default EaSportsFc26Instructions;
