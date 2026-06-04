import { ArcRaidersConditionPropsMap } from "../conditions/arcraiders";

type ArcRaidersInstructionType = keyof ArcRaidersConditionPropsMap;

export const ArcRaidersInstructions: Record<ArcRaidersInstructionType, string> =
  {
    "arc_raiders.game_start": "React to the raid starting.",
    "arc_raiders.game_end": "React to the raid ending.",
    "arc_raiders.victory": "Celebrate {player}'s victory!",
    "arc_raiders.defeat": "React to {player}'s defeat.",
    "arc_raiders.player_knocked": "React to {player} going down.",
    "arc_raiders.player_eliminated": "React to {player} being eliminated.",
    "arc_raiders.enemy_spotted": "React to an enemy being spotted.",
    "arc_raiders.enemy_detected": "React to an enemy detected nearby.",
    "arc_raiders.interesting_moment": "React to an interesting moment.",
  };

export default ArcRaidersInstructions;
