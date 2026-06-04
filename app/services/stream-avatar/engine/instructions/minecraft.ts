import { MinecraftConditionPropsMap } from "../conditions/minecraft";

type MinecraftInstructionType = keyof MinecraftConditionPropsMap;

export const MinecraftInstructions: Record<MinecraftInstructionType, string> =
  {
    "minecraft.ender_dragon_spawned":
      "React to the Ender Dragon spawning.",
    "minecraft.boss_killed":
      "Celebrate {player} defeating the boss!",
    "minecraft.wither_spawned":
      "React to {player} summoning the Wither.",
    "minecraft.advancement_made":
      "React to {player} earning an advancement.",
    "minecraft.first_diamond":
      "Celebrate {player} finding diamonds!",
    "minecraft.nether_entered":
      "React to {player} entering the Nether.",
    "minecraft.player_eliminated":
      "React to {player} dying in Minecraft.",
    "minecraft.low_health":
      "Panic about {player}'s low health.",
    "minecraft.totem_of_undying_used":
      "React to {player} using a Totem of Undying.",
  };

export default MinecraftInstructions;
