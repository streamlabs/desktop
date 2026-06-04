import { ForzaHorizon6ConditionPropsMap } from "../conditions/forzahorizon6";
type ForzaHorizon6InstructionType = keyof ForzaHorizon6ConditionPropsMap;

export const ForzaHorizon6Instructions: Record<ForzaHorizon6InstructionType, string> = {
  "forza_horizon_6.game_start": "React to the race starting. 8 words max.",
  "forza_horizon_6.game_end": "React to {player} finishing the race. 8 words max.",
  "forza_horizon_6.position_change": "React to {player}'s race position changing. 8 words max.",
  "forza_horizon_6.lap_change": "React to {player} starting a new lap. 8 words max.",
  "forza_horizon_6.great_drift": "React to {player} pulling off an epic drift. 8 words max.",
  "forza_horizon_6.great_air": "React to {player} catching massive air. 8 words max.",
  "forza_horizon_6.great_skill_chain": "React to {player} landing a great skill chain. 8 words max.",
};

export default ForzaHorizon6Instructions;
