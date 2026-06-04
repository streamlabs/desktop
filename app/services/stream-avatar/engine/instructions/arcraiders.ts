import { ArcRaidersConditionPropsMap } from "../conditions/arcraiders";

type ArcRaidersInstructionType = keyof ArcRaidersConditionPropsMap;

export const ArcRaidersInstructions: Record<ArcRaidersInstructionType, string> =
  {
    "arc_raiders.game_start": "React to the raid starting. 8 words max.",
    "arc_raiders.game_end": "React to the raid ending. 8 words max.",
    "arc_raiders.victory": "Celebrate {player}'s victory! 8 words max.",
    "arc_raiders.defeat": "React to {player}'s defeat. 8 words max.",
    "arc_raiders.player_knocked": "React to {player} going down. 8 words max.",
    "arc_raiders.player_eliminated": "React to {player} being eliminated. 8 words max.",
    "arc_raiders.enemy_spotted": "React to an enemy being spotted. 8 words max.",
    "arc_raiders.enemy_detected": "React to an enemy detected nearby. 8 words max.",
    "arc_raiders.interesting_moment": "React to an interesting moment. 8 words max.",
  };

export default ArcRaidersInstructions;
