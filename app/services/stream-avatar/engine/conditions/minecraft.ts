import { ConditionDefinition } from '.';
import { onEvent } from './shared';

export type MinecraftConditionPropsMap = {
  //----------------------
  // Minecraft
  //----------------------

  // Boss Events
  'minecraft.ender_dragon_spawned': undefined;
  'minecraft.boss_killed': undefined;
  'minecraft.wither_spawned': undefined;

  // Progression
  'minecraft.advancement_made': undefined;
  'minecraft.first_diamond': undefined;
  'minecraft.nether_entered': undefined;

  // Player
  'minecraft.player_eliminated': undefined;
  'minecraft.low_health': undefined;
  'minecraft.totem_of_undying_used': undefined;
};

export type MinecraftConditionType = keyof MinecraftConditionPropsMap;
export type MinecraftConditionProps<
  T extends MinecraftConditionType
> = MinecraftConditionPropsMap[T];

export const MinecraftConditions: {
  [K in MinecraftConditionType]: ConditionDefinition<K>;
} = {
  'minecraft.ender_dragon_spawned': {
    label: 'Ender Dragon Spawned',
    evaluate: onEvent('ender_dragon_spawned'),
  },
  'minecraft.boss_killed': { label: 'Boss Killed', evaluate: onEvent('boss_killed') },
  'minecraft.wither_spawned': { label: 'Wither Spawned', evaluate: onEvent('wither_spawned') },
  'minecraft.advancement_made': { label: 'Advancement Made', evaluate: onEvent('advancement_made') },
  'minecraft.first_diamond': { label: 'First Diamond', evaluate: onEvent('first_diamond') },
  'minecraft.nether_entered': { label: 'Nether Entered', evaluate: onEvent('nether_entered') },
  'minecraft.player_eliminated': { label: 'Player Eliminated', evaluate: onEvent('death') },

  // Edge-triggered: fires only on the tick health first drops into the danger zone.
  'minecraft.low_health': {
    label: 'Low Health',
    evaluate: ({ state, prevState }) => {
      const { health = 100 } = state;
      const { health: prevHealth = 100 } = prevState;
      return health < 50 && prevHealth >= 50;
    },
  },

  'minecraft.totem_of_undying_used': {
    label: 'Totem of Undying Used',
    evaluate: onEvent('totem_of_undying_used'),
  },
};

export default MinecraftConditions;
