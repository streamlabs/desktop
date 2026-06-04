import { DeadByDaylightConditionPropsMap } from "../conditions/deadbydaylight";
type DeadByDaylightInstructionType = keyof DeadByDaylightConditionPropsMap;

export const DeadByDaylightInstructions: Record<DeadByDaylightInstructionType, string> = {
  "dead_by_daylight.game_start": "React to the trial beginning.",
  "dead_by_daylight.game_end": "React to the trial ending.",
  "dead_by_daylight.victory": "React to the match ending in victory.",
  "dead_by_daylight.player_eliminated": "React to {player} being sacrificed.",
  "dead_by_daylight.elimination": "React to a survivor being sacrificed.",
  "dead_by_daylight.hooked_survivor": "React to a survivor being hooked.",
  "dead_by_daylight.escaped": "React to a survivor escaping.",
};

export default DeadByDaylightInstructions;
