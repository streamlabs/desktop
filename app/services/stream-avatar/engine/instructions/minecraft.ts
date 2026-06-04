import { MinecraftConditionPropsMap } from "../conditions/minecraft";

type MinecraftInstructionType = keyof MinecraftConditionPropsMap;

export const MinecraftInstructions: Record<MinecraftInstructionType, string> =
  {
    "minecraft.ender_dragon_spawned":
      "React to the Ender Dragon spawning. 8 words max.",
    "minecraft.boss_killed":
      "Celebrate {player} defeating the boss! 8 words max.",
    "minecraft.wither_spawned":
      "React to {player} summoning the Wither. 8 words max.",
    "minecraft.advancement_made":
      "React to {player} earning an advancement. 8 words max.",
    "minecraft.first_diamond":
      "Celebrate {player} finding diamonds! 8 words max.",
    "minecraft.nether_entered":
      "React to {player} entering the Nether. 8 words max.",
    "minecraft.player_eliminated":
      "React to {player} dying in Minecraft. 8 words max.",
    "minecraft.low_health":
      "Panic about {player}'s low health. 8 words max.",
    "minecraft.totem_of_undying_used":
      "React to {player} using a Totem of Undying. 8 words max.",
  };

export default MinecraftInstructions;
