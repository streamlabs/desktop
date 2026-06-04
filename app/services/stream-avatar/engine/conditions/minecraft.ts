import { ConditionDefinition } from '.';

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
    group: 'minecraft',
    name: 'ender_dragon_spawned',
    label: 'Ender Dragon Spawned',
    evaluate: ({ state }) => state.pendingEvents.has('ender_dragon_spawned'),
  },

  'minecraft.boss_killed': {
    group: 'minecraft',
    name: 'boss_killed',
    label: 'Boss Killed',
    evaluate: ({ state }) => state.pendingEvents.has('boss_killed'),
  },

  'minecraft.wither_spawned': {
    group: 'minecraft',
    name: 'wither_spawned',
    label: 'Wither Spawned',
    evaluate: ({ state }) => state.pendingEvents.has('wither_spawned'),
  },

  'minecraft.advancement_made': {
    group: 'minecraft',
    name: 'advancement_made',
    label: 'Advancement Made',
    evaluate: ({ state }) => state.pendingEvents.has('advancement_made'),
  },

  'minecraft.first_diamond': {
    group: 'minecraft',
    name: 'first_diamond',
    label: 'First Diamond',
    evaluate: ({ state }) => state.pendingEvents.has('first_diamond'),
  },

  'minecraft.nether_entered': {
    group: 'minecraft',
    name: 'nether_entered',
    label: 'Nether Entered',
    evaluate: ({ state }) => state.pendingEvents.has('nether_entered'),
  },

  'minecraft.player_eliminated': {
    group: 'minecraft',
    name: 'player_eliminated',
    label: 'Player Eliminated',
    evaluate: ({ state }) => state.pendingEvents.has('death'),
  },

  'minecraft.low_health': {
    group: 'minecraft',
    name: 'low_health',
    label: 'Low Health',
    evaluate: ({ state, prevState }) => {
      const { health = 100 } = state;
      const { health: prevHealth = 100 } = prevState;
      return health < 50 && prevHealth >= 50;
    },
  },

  'minecraft.totem_of_undying_used': {
    group: 'minecraft',
    name: 'totem_of_undying_used',
    label: 'Totem of Undying Used',
    evaluate: ({ state }) => state.pendingEvents.has('totem_of_undying_used'),
  },
} as const;

export default MinecraftConditions;
