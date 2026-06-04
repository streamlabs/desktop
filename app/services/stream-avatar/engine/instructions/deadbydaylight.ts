import { DeadByDaylightConditionPropsMap } from "../conditions/deadbydaylight";
type DeadByDaylightInstructionType = keyof DeadByDaylightConditionPropsMap;

export const DeadByDaylightInstructions: Record<DeadByDaylightInstructionType, string> = {
  "dead_by_daylight.game_start": "React to the trial beginning. 8 words max.",
  "dead_by_daylight.game_end": "React to the trial ending. 8 words max.",
  "dead_by_daylight.victory": "React to the match ending in victory. 8 words max.",
  "dead_by_daylight.player_eliminated": "React to {player} being sacrificed. 8 words max.",
  "dead_by_daylight.elimination": "React to a survivor being sacrificed. 8 words max.",
  "dead_by_daylight.hooked_survivor": "React to a survivor being hooked. 8 words max.",
  "dead_by_daylight.escaped": "React to a survivor escaping. 8 words max.",
};

export default DeadByDaylightInstructions;
