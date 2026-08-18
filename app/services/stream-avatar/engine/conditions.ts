import { $t } from 'services/i18n';
import type { PropertyInstance } from './properties';
import type { GameState } from './game-state';
import { Properties } from './properties';

// ─── Shared evaluation helpers ────────────────────────────────────────

type EvalArgs<P> = { state: GameState; prevState: GameState; props: P };

const onEvent = (event: string) => ({ state }: { state: GameState }): boolean =>
  state.pendingEvents.has(event);

const lowHealth = ({ state }: { state: GameState }): boolean => {
  const { health = 0 } = state;
  return health > 0 && health < 50;
};

const hasShield = ({ state }: { state: GameState }): boolean => (state.shield ?? 0) > 0;
const noShield = ({ state }: { state: GameState }): boolean => (state.shield ?? 0) === 0;

const eliminationCount = () => ({
  label: $t('Enemy Elimination Count'),
  properties: {
    elimination_count: new Properties.SliderRange({
      label: $t('# of Eliminations'),
      min: 0,
      max: 50,
      default: [5, 5],
      step: 1,
    }),
  },
  evaluate: ({ state, props }: EvalArgs<{ elimination_count?: [number, number] }>) => {
    const [min, max] = props?.elimination_count ?? [5, 5];
    const { eliminations = 0 } = state;
    return eliminations >= min && eliminations <= max;
  },
});

const playersRemaining = (sliderMax: number) => ({
  label: $t('Players Remaining (coming soon)'),
  disabled: true,
  properties: {
    players_remaining: new Properties.SliderRange({
      label: $t('# of Players Remaining'),
      min: 1,
      max: sliderMax,
      default: [1, 1],
      step: 1,
    }),
  },
  evaluate: ({ state, props }: EvalArgs<{ players_remaining?: [number, number] }>) => {
    const [min, max] = props?.players_remaining ?? [1, 1];
    const { playersRemaining: remaining = 0 } = state;
    return remaining >= min && remaining <= max;
  },
});

// ─── Condition props map ──────────────────────────────────────────────

export type ConditionPropsMap = {
  // Fortnite
  'fortnite.game_started': undefined;
  'fortnite.deployed': undefined;
  'fortnite.storm_closing': undefined;
  'fortnite.game_ended': undefined;
  'fortnite.low_health': undefined;
  'fortnite.has_shield': undefined;
  'fortnite.no_shield': undefined;
  'fortnite.victory_royale': undefined;
  'fortnite.player_eliminated': undefined;
  'fortnite.player_knocked': undefined;
  'fortnite.defeat': undefined;
  'fortnite.elimination': undefined;
  'fortnite.knocked': undefined;
  'fortnite.elimination_count': { elimination_count?: [number, number] };
  'fortnite.players_remaining': { players_remaining?: [number, number] };

  // PUBG
  'pubg.game_started': undefined;
  'pubg.deployed': undefined;
  'pubg.storm_closing': undefined;
  'pubg.game_ended': undefined;
  'pubg.victory': undefined;
  'pubg.player_eliminated': undefined;
  'pubg.player_knocked': undefined;
  'pubg.defeat': undefined;
  'pubg.elimination': undefined;
  'pubg.knocked': undefined;
  'pubg.elimination_count': { elimination_count?: [number, number] };
  'pubg.players_remaining': { players_remaining?: [number, number] };

  // Valorant
  'valorant.round_started': undefined;
  'valorant.low_health': undefined;
  'valorant.victory': undefined;
  'valorant.player_eliminated': undefined;
  'valorant.defeat': undefined;
  'valorant.elimination': undefined;
  'valorant.elimination_count': { elimination_count?: [number, number] };

  // Counter-Strike 2
  'counter_strike_2.round_started': undefined;
  'counter_strike_2.first_half': undefined;
  'counter_strike_2.second_half': undefined;
  'counter_strike_2.round_won': undefined;
  'counter_strike_2.round_lost': undefined;
  'counter_strike_2.game_ended': undefined;
  'counter_strike_2.low_health': undefined;
  'counter_strike_2.victory': undefined;
  'counter_strike_2.player_eliminated': undefined;
  'counter_strike_2.defeat': undefined;
  'counter_strike_2.elimination': undefined;
  'counter_strike_2.elimination_count': { elimination_count?: [number, number] };

  // Warzone
  'warzone.deploy': undefined;
  'warzone.gulag_start': undefined;
  'warzone.gulag_end': undefined;
  'warzone.spectating': undefined;
  'warzone.redeploying': undefined;
  'warzone.victory': undefined;
  'warzone.player_knocked': undefined;
  'warzone.player_eliminated': undefined;
  'warzone.defeat': undefined;
  'warzone.elimination': undefined;
  'warzone.knockout': undefined;
  'warzone.elimination_count': { elimination_count?: [number, number] };
  'warzone.players_remaining': { players_remaining?: [number, number] };

  // Arc Raiders
  'arc_raiders.elimination': undefined;
  'arc_raiders.game_start': undefined;
  'arc_raiders.game_end': undefined;
  'arc_raiders.victory': undefined;
  'arc_raiders.defeat': undefined;
  'arc_raiders.player_knocked': undefined;
  'arc_raiders.player_eliminated': undefined;
  'arc_raiders.enemy_spotted': undefined;
  'arc_raiders.enemy_detected': undefined;
  'arc_raiders.interesting_moment': undefined;

  // Call of Duty: Black Ops 6
  'black_ops_6.elimination': undefined;
  'black_ops_6.victory': undefined;
  'black_ops_6.defeat': undefined;
  'black_ops_6.spectating': undefined;

  // Rocket League
  'rocket_league.game_start': undefined;
  'rocket_league.game_end': undefined;
  'rocket_league.team_scored': undefined;
  'rocket_league.opponent_scored': undefined;
  'rocket_league.victory': undefined;
  'rocket_league.defeat': undefined;

  // Minecraft
  'minecraft.ender_dragon_spawned': undefined;
  'minecraft.boss_killed': undefined;
  'minecraft.wither_spawned': undefined;
  'minecraft.advancement_made': undefined;
  'minecraft.first_diamond': undefined;
  'minecraft.nether_entered': undefined;
  'minecraft.player_eliminated': undefined;
  'minecraft.low_health': undefined;
  'minecraft.totem_of_undying_used': undefined;

  // Apex Legends
  'apex_legends.game_start': undefined;
  'apex_legends.deploy': undefined;
  'apex_legends.storm_shrinking': undefined;
  'apex_legends.game_end': undefined;
  'apex_legends.player_knocked': undefined;
  'apex_legends.player_revived': undefined;
  'apex_legends.player_eliminated': undefined;
  'apex_legends.victory': undefined;
  'apex_legends.defeat': undefined;
  'apex_legends.elimination': undefined;
  'apex_legends.knockout': undefined;

  // Battlefield 6
  'battlefield_6.game_start': undefined;
  'battlefield_6.game_end': undefined;
  'battlefield_6.victory': undefined;
  'battlefield_6.defeat': undefined;
  'battlefield_6.elimination': undefined;
  'battlefield_6.player_eliminated': undefined;

  // Dead by Daylight
  'dead_by_daylight.game_start': undefined;
  'dead_by_daylight.game_end': undefined;
  'dead_by_daylight.victory': undefined;
  'dead_by_daylight.player_eliminated': undefined;
  'dead_by_daylight.elimination': undefined;
  'dead_by_daylight.hooked_survivor': undefined;
  'dead_by_daylight.escaped': undefined;

  // Deadlock
  'deadlock.game_start': undefined;
  'deadlock.game_end': undefined;
  'deadlock.victory': undefined;
  'deadlock.defeat': undefined;
  'deadlock.elimination': undefined;
  'deadlock.player_eliminated': undefined;

  // Dota 2
  'dota_2.game_start': undefined;
  'dota_2.game_end': undefined;
  'dota_2.victory': undefined;
  'dota_2.defeat': undefined;
  'dota_2.elimination': undefined;
  'dota_2.player_eliminated': undefined;
  'dota_2.tower_destroyed': undefined;
  'dota_2.glyph_used': undefined;

  // League of Legends
  'league_of_legends.game_start': undefined;
  'league_of_legends.game_end': undefined;
  'league_of_legends.victory': undefined;
  'league_of_legends.defeat': undefined;
  'league_of_legends.elimination': undefined;
  'league_of_legends.player_eliminated': undefined;
  'league_of_legends.objective_ally': undefined;
  'league_of_legends.objective_enemy': undefined;
  'league_of_legends.enemy_turret_destroyed': undefined;
  'league_of_legends.ally_turret_destroyed': undefined;

  // Marvel Rivals
  'marvel_rivals.game_end': undefined;
  'marvel_rivals.victory': undefined;
  'marvel_rivals.defeat': undefined;
  'marvel_rivals.elimination': undefined;
  'marvel_rivals.player_eliminated': undefined;

  // Overwatch 2
  'overwatch_2.round_start': undefined;
  'overwatch_2.round_end': undefined;
  'overwatch_2.victory': undefined;
  'overwatch_2.defeat': undefined;
  'overwatch_2.elimination': undefined;
  'overwatch_2.player_eliminated': undefined;

  // Rainbow Six Siege
  'rainbow_six_siege.round_start': undefined;
  'rainbow_six_siege.action_phase': undefined;
  'rainbow_six_siege.round_end': undefined;
  'rainbow_six_siege.victory': undefined;
  'rainbow_six_siege.defeat': undefined;
  'rainbow_six_siege.elimination': undefined;
  'rainbow_six_siege.player_eliminated': undefined;

  // War Thunder
  'war_thunder.elimination': undefined;

  // Marathon
  'marathon.game_start': undefined;
  'marathon.game_end': undefined;
  'marathon.victory': undefined;
  'marathon.defeat': undefined;
  'marathon.player_knocked': undefined;
  'marathon.player_eliminated': undefined;
  'marathon.elimination': undefined;
  'marathon.knockout': undefined;

  // F1 25
  'f1_25.game_start': undefined;
  'f1_25.game_end': undefined;
  'f1_25.victory': undefined;
  'f1_25.position_change': undefined;
  'f1_25.lap_change': undefined;

  // EA Sports FC 26
  'ea_sports_fc_26.game_start': undefined;
  'ea_sports_fc_26.game_end': undefined;
  'ea_sports_fc_26.goal': undefined;
  'ea_sports_fc_26.set_piece': undefined;
  'ea_sports_fc_26.halftime': undefined;
  'ea_sports_fc_26.fulltime': undefined;

  // NBA 2K26
  'nba_2k26.game_start': undefined;
  'nba_2k26.game_end': undefined;
  'nba_2k26.goal': undefined;
  'nba_2k26.halftime': undefined;

  // Forza Horizon 6
  'forza_horizon_6.game_start': undefined;
  'forza_horizon_6.game_end': undefined;
  'forza_horizon_6.position_change': undefined;
  'forza_horizon_6.lap_change': undefined;
  'forza_horizon_6.great_drift': undefined;
  'forza_horizon_6.great_air': undefined;
  'forza_horizon_6.great_skill_chain': undefined;

  // Enshrouded
  'enshrouded.player_eliminated': undefined;
  'enshrouded.level_up': undefined;
  'enshrouded.soul_discovered': undefined;
  'enshrouded.quest_update': undefined;

  // 7 Days to Die
  '7_days_to_die.player_eliminated': undefined;
  '7_days_to_die.low_health': undefined;
  '7_days_to_die.blood_moon_start': undefined;
  '7_days_to_die.blood_moon_peak': undefined;
  '7_days_to_die.blood_moon_end': undefined;

  // Arena Breakout: Infinite
  'arena_breakout_infinite.game_start': undefined;
  'arena_breakout_infinite.game_end': undefined;
  'arena_breakout_infinite.victory': undefined;
  'arena_breakout_infinite.defeat': undefined;
  'arena_breakout_infinite.player_eliminated': undefined;
  'arena_breakout_infinite.enemy_spotted': undefined;
  'arena_breakout_infinite.enemy_detected': undefined;

  // Bloodborne
  'bloodborne.boss_killed': undefined;
  'bloodborne.player_eliminated': undefined;

  // Dark Souls II
  'dark_souls_2.boss_killed': undefined;
  'dark_souls_2.player_eliminated': undefined;

  // Dark Souls III
  'dark_souls_3.boss_killed': undefined;
  'dark_souls_3.player_eliminated': undefined;

  // Dark Souls: Remastered
  'dark_souls_remastered.boss_killed': undefined;
  'dark_souls_remastered.player_eliminated': undefined;

  // DayZ
  'dayz.player_eliminated': undefined;

  // Delta Force
  'delta_force.game_end': undefined;
  'delta_force.victory': undefined;
  'delta_force.defeat': undefined;
  'delta_force.elimination': undefined;
  'delta_force.assist': undefined;
  'delta_force.revive': undefined;
  'delta_force.capturing_objective': undefined;
  'delta_force.captured_objective': undefined;
  'delta_force.player_eliminated': undefined;

  // Elden Ring
  'elden_ring.boss_killed': undefined;
  'elden_ring.player_eliminated': undefined;

  // Escape from Tarkov
  'escape_from_tarkov.game_start': undefined;
  'escape_from_tarkov.game_end': undefined;
  'escape_from_tarkov.victory': undefined;
  'escape_from_tarkov.defeat': undefined;
  'escape_from_tarkov.player_eliminated': undefined;
  'escape_from_tarkov.enemy_spotted': undefined;
  'escape_from_tarkov.enemy_detected': undefined;
  'escape_from_tarkov.item_found': undefined;
  'escape_from_tarkov.interesting_moment': undefined;

  // Halo Infinite
  'halo_infinite.game_start': undefined;
  'halo_infinite.game_end': undefined;
  'halo_infinite.victory': undefined;
  'halo_infinite.defeat': undefined;
  'halo_infinite.elimination': undefined;
  'halo_infinite.assist': undefined;
  'halo_infinite.captured_objective': undefined;
  'halo_infinite.player_eliminated': undefined;

  // Helldivers 2
  'helldivers_2.game_end': undefined;
  'helldivers_2.victory': undefined;
  'helldivers_2.defeat': undefined;
  'helldivers_2.player_eliminated': undefined;
  'helldivers_2.objective_spawned': undefined;
  'helldivers_2.shuttle_landing': undefined;
  'helldivers_2.interesting_moment': undefined;

  // Heroes of the Storm
  'heroes_of_the_storm.game_start': undefined;
  'heroes_of_the_storm.game_end': undefined;
  'heroes_of_the_storm.victory': undefined;
  'heroes_of_the_storm.defeat': undefined;
  'heroes_of_the_storm.elimination': undefined;
  'heroes_of_the_storm.player_eliminated': undefined;

  // Hunt: Showdown 1896
  'hunt_showdown_1896.game_start': undefined;
  'hunt_showdown_1896.game_end': undefined;
  'hunt_showdown_1896.victory': undefined;
  'hunt_showdown_1896.elimination': undefined;
  'hunt_showdown_1896.player_eliminated': undefined;
  'hunt_showdown_1896.objective_spawned': undefined;
  'hunt_showdown_1896.bounty_acquired': undefined;
  'hunt_showdown_1896.interesting_moment': undefined;

  // Left 4 Dead 2
  'left_4_dead_2.elimination': undefined;
  'left_4_dead_2.player_eliminated': undefined;
  'left_4_dead_2.healing': undefined;
  'left_4_dead_2.interesting_moment': undefined;

  // Madden NFL 27
  'madden_nfl_27.game_start': undefined;
  'madden_nfl_27.game_end': undefined;
  'madden_nfl_27.goal': undefined;
  'madden_nfl_27.touchdown': undefined;
  'madden_nfl_27.field_goal': undefined;
  'madden_nfl_27.halftime': undefined;
  'madden_nfl_27.final_score': undefined;

  // Mortal Shell 2
  'mortal_shell_2.boss_killed': undefined;
  'mortal_shell_2.item_found': undefined;
  'mortal_shell_2.player_eliminated': undefined;

  // Palworld
  'palworld.boss_killed': undefined;
  'palworld.new_pal_captured': undefined;
  'palworld.player_eliminated': undefined;

  // Rust
  'rust.player_knocked': undefined;
  'rust.player_eliminated': undefined;
  'rust.interesting_moment': undefined;

  // Sekiro: Shadows Die Twice
  'sekiro_shadows_die_twice.boss_killed': undefined;
  'sekiro_shadows_die_twice.player_eliminated': undefined;

  // Teamfight Tactics
  'teamfight_tactics.game_start': undefined;
  'teamfight_tactics.game_end': undefined;
  'teamfight_tactics.victory': undefined;
  'teamfight_tactics.defeat': undefined;
  'teamfight_tactics.interesting_moment': undefined;

  // Valheim
  'valheim.advancement_made': undefined;
  'valheim.boss_spawned': undefined;
  'valheim.boss_killed': undefined;
  'valheim.player_eliminated': undefined;
  'valheim.hunt_start': undefined;
  'valheim.hunt_end': undefined;

  // World of Warcraft: Solo Shuffle
  'world_of_warcraft_ss.game_start': undefined;
  'world_of_warcraft_ss.game_end': undefined;
  'world_of_warcraft_ss.round_start': undefined;
  'world_of_warcraft_ss.round_won': undefined;
  'world_of_warcraft_ss.round_lost': undefined;
  'world_of_warcraft_ss.victory': undefined;
  'world_of_warcraft_ss.defeat': undefined;
  'world_of_warcraft_ss.draw': undefined;
};

export type ConditionType = keyof ConditionPropsMap;
export type ConditionProps<T extends ConditionType> = ConditionPropsMap[T];

export type ConditionDefinition<K extends ConditionType> = {
  label: string;
  disabled?: boolean;
  properties?: Record<string, PropertyInstance>;
  evaluate: (args: {
    state: GameState;
    prevState: GameState;
    props: ConditionPropsMap[K];
  }) => boolean;
};

export type RegisteredCondition<K extends ConditionType> = ConditionDefinition<K> & {
  group: string;
};

// ─── Condition registry ───────────────────────────────────────────────

const perGameConditions = () =>
  ({
    // Fortnite
    'fortnite.game_started': { label: $t('Game Started'), evaluate: onEvent('game_start') },
    'fortnite.deployed': { label: $t('Deployed'), evaluate: onEvent('deploy') },
    'fortnite.game_ended': { label: $t('Game Ended'), evaluate: onEvent('game_end') },
    'fortnite.low_health': { label: $t('Low Health'), evaluate: lowHealth },
    'fortnite.has_shield': { label: $t('Has Shield'), evaluate: hasShield },
    'fortnite.no_shield': { label: $t('No Shield'), evaluate: noShield },
    'fortnite.victory_royale': { label: $t('Victory Royale'), evaluate: onEvent('victory') },
    'fortnite.defeat': { label: $t('Defeat'), evaluate: onEvent('defeat') },
    'fortnite.player_eliminated': { label: $t('Player Eliminated'), evaluate: onEvent('death') },
    'fortnite.player_knocked': { label: $t('Player Knocked'), evaluate: onEvent('player_knocked') },
    'fortnite.storm_closing': { label: $t('Storm Closing'), evaluate: onEvent('storm_shrinking') },
    'fortnite.elimination': { label: $t('Enemy Eliminated'), evaluate: onEvent('elimination') },
    'fortnite.knocked': { label: $t('Enemy Knocked'), evaluate: onEvent('knockout') },
    'fortnite.elimination_count': eliminationCount(),
    'fortnite.players_remaining': playersRemaining(100),

    // PUBG
    'pubg.game_started': { label: $t('Game Started'), evaluate: onEvent('game_start') },
    'pubg.deployed': { label: $t('Deployed'), evaluate: onEvent('deploy') },
    'pubg.storm_closing': { label: $t('Storm Closing'), evaluate: onEvent('storm_shrinking') },
    'pubg.game_ended': { label: $t('Game Ended'), evaluate: onEvent('game_end') },
    'pubg.victory': { label: $t('Victory'), evaluate: onEvent('victory') },
    'pubg.defeat': { label: $t('Defeat'), evaluate: onEvent('defeat') },
    'pubg.player_eliminated': { label: $t('Player Eliminated'), evaluate: onEvent('death') },
    'pubg.player_knocked': { label: $t('Player Knocked'), evaluate: onEvent('player_knocked') },
    'pubg.elimination': { label: $t('Enemy Eliminated'), evaluate: onEvent('elimination') },
    'pubg.knocked': { label: $t('Enemy Knocked'), evaluate: onEvent('knockout') },
    'pubg.elimination_count': eliminationCount(),
    'pubg.players_remaining': playersRemaining(100),

    // Valorant
    'valorant.round_started': { label: $t('Round Started'), evaluate: onEvent('round_start') },
    'valorant.low_health': { label: $t('Low Health'), evaluate: lowHealth },
    'valorant.victory': { label: $t('Victory'), evaluate: onEvent('victory') },
    'valorant.defeat': { label: $t('Defeat'), evaluate: onEvent('defeat') },
    'valorant.player_eliminated': { label: $t('Player Eliminated'), evaluate: onEvent('death') },
    'valorant.elimination': { label: $t('Enemy Eliminated'), evaluate: onEvent('elimination') },
    'valorant.elimination_count': eliminationCount(),

    // Counter-Strike 2
    'counter_strike_2.round_started': {
      label: $t('Round Started'),
      evaluate: onEvent('round_start'),
    },
    'counter_strike_2.low_health': { label: $t('Low Health'), evaluate: lowHealth },
    'counter_strike_2.victory': { label: $t('Victory'), evaluate: onEvent('victory') },
    'counter_strike_2.defeat': { label: $t('Defeat'), evaluate: onEvent('defeat') },
    'counter_strike_2.player_eliminated': {
      label: $t('Player Eliminated'),
      evaluate: onEvent('death'),
    },
    'counter_strike_2.elimination': {
      label: $t('Enemy Eliminated'),
      evaluate: onEvent('elimination'),
    },
    'counter_strike_2.elimination_count': eliminationCount(),
    'counter_strike_2.first_half': { label: $t('First Half'), evaluate: onEvent('first_half') },
    'counter_strike_2.second_half': { label: $t('Second Half'), evaluate: onEvent('second_half') },
    'counter_strike_2.round_won': { label: $t('Round Won'), evaluate: onEvent('round_won') },
    'counter_strike_2.round_lost': { label: $t('Round Lost'), evaluate: onEvent('round_lost') },
    'counter_strike_2.game_ended': { label: $t('Game Ended'), evaluate: onEvent('game_end') },

    // Warzone
    'warzone.deploy': { label: $t('Deploy'), evaluate: onEvent('deploy') },
    'warzone.elimination': { label: $t('Enemy Eliminated'), evaluate: onEvent('elimination') },
    'warzone.knockout': { label: $t('Enemy Downed'), evaluate: onEvent('knockout') },
    'warzone.player_knocked': { label: $t('Player Downed'), evaluate: onEvent('player_knocked') },
    'warzone.player_eliminated': { label: $t('Player Eliminated'), evaluate: onEvent('death') },
    'warzone.victory': { label: $t('Victory'), evaluate: onEvent('victory') },
    'warzone.defeat': { label: $t('Defeat'), evaluate: onEvent('defeat') },
    'warzone.gulag_start': { label: $t('Gulag Started'), evaluate: onEvent('gulag_start') },
    'warzone.gulag_end': { label: $t('Gulag Ended'), evaluate: onEvent('gulag_end') },
    'warzone.spectating': { label: $t('Spectating'), evaluate: onEvent('spectating') },
    'warzone.redeploying': { label: $t('Redeploying'), evaluate: onEvent('redeploying') },
    'warzone.elimination_count': eliminationCount(),
    'warzone.players_remaining': playersRemaining(150),

    // Arc Raiders
    'arc_raiders.elimination': { label: $t('Enemy Eliminated'), evaluate: onEvent('elimination') },
    'arc_raiders.game_start': { label: $t('Game Started'), evaluate: onEvent('game_start') },
    'arc_raiders.game_end': { label: $t('Game Ended'), evaluate: onEvent('game_end') },
    'arc_raiders.victory': { label: $t('Victory'), evaluate: onEvent('victory') },
    'arc_raiders.defeat': { label: $t('Defeat'), evaluate: onEvent('defeat') },
    'arc_raiders.player_knocked': {
      label: $t('Player Knocked'),
      evaluate: onEvent('player_knocked'),
    },
    'arc_raiders.player_eliminated': { label: $t('Player Eliminated'), evaluate: onEvent('death') },
    'arc_raiders.enemy_spotted': { label: $t('Enemy Spotted'), evaluate: onEvent('enemy_spotted') },
    'arc_raiders.enemy_detected': {
      label: $t('Enemy Detected'),
      evaluate: onEvent('enemy_detected'),
    },
    'arc_raiders.interesting_moment': {
      label: $t('Interesting Moment'),
      evaluate: onEvent('interesting_moment'),
    },

    // Call of Duty: Black Ops 6
    'black_ops_6.elimination': { label: $t('Enemy Eliminated'), evaluate: onEvent('elimination') },
    'black_ops_6.victory': { label: $t('Victory'), evaluate: onEvent('victory') },
    'black_ops_6.defeat': { label: $t('Defeat'), evaluate: onEvent('defeat') },
    'black_ops_6.spectating': { label: $t('Spectating'), evaluate: onEvent('spectating') },

    // Rocket League
    'rocket_league.game_start': { label: $t('Game Started'), evaluate: onEvent('game_start') },
    'rocket_league.game_end': { label: $t('Game Ended'), evaluate: onEvent('game_end') },
    'rocket_league.team_scored': { label: $t('Team Scored'), evaluate: onEvent('team_scored') },
    'rocket_league.opponent_scored': {
      label: $t('Opponent Scored'),
      evaluate: onEvent('opponent_scored'),
    },
    'rocket_league.victory': { label: $t('Victory'), evaluate: onEvent('victory') },
    'rocket_league.defeat': { label: $t('Defeat'), evaluate: onEvent('defeat') },

    // Minecraft
    'minecraft.ender_dragon_spawned': {
      label: $t('Ender Dragon Spawned'),
      evaluate: onEvent('ender_dragon_spawned'),
    },
    'minecraft.boss_killed': { label: $t('Boss Killed'), evaluate: onEvent('boss_killed') },
    'minecraft.wither_spawned': {
      label: $t('Wither Spawned'),
      evaluate: onEvent('wither_spawned'),
    },
    'minecraft.advancement_made': {
      label: $t('Advancement Made'),
      evaluate: onEvent('advancement_made'),
    },
    'minecraft.first_diamond': { label: $t('First Diamond'), evaluate: onEvent('first_diamond') },
    'minecraft.nether_entered': {
      label: $t('Nether Entered'),
      evaluate: onEvent('nether_entered'),
    },
    'minecraft.player_eliminated': { label: $t('Player Eliminated'), evaluate: onEvent('death') },
    // Edge-triggered: fires only on the tick health first drops into the danger zone.
    'minecraft.low_health': {
      label: $t('Low Health'),
      evaluate: ({
        state,
        prevState,
      }: {
        state: GameState;
        prevState: GameState;
        props: undefined;
      }) => {
        const { health = 100 } = state;
        const { health: prevHealth = 100 } = prevState;
        return health < 50 && prevHealth >= 50;
      },
    },
    'minecraft.totem_of_undying_used': {
      label: $t('Totem of Undying Used'),
      evaluate: onEvent('totem_of_undying_used'),
    },

    // Apex Legends
    'apex_legends.game_start': { label: $t('Game Started'), evaluate: onEvent('game_start') },
    'apex_legends.deploy': { label: $t('Deployed'), evaluate: onEvent('deploy') },
    'apex_legends.storm_shrinking': {
      label: $t('Ring Closing'),
      evaluate: onEvent('storm_shrinking'),
    },
    'apex_legends.game_end': { label: $t('Game Ended'), evaluate: onEvent('game_end') },
    'apex_legends.player_knocked': {
      label: $t('Player Knocked'),
      evaluate: onEvent('player_knocked'),
    },
    'apex_legends.player_revived': {
      label: $t('Player Revived'),
      evaluate: onEvent('player_revived'),
    },
    'apex_legends.player_eliminated': {
      label: $t('Player Eliminated'),
      evaluate: onEvent('death'),
    },
    'apex_legends.victory': { label: $t('Victory (Champion)'), evaluate: onEvent('victory') },
    'apex_legends.defeat': { label: $t('Defeat'), evaluate: onEvent('defeat') },
    'apex_legends.elimination': { label: $t('Enemy Eliminated'), evaluate: onEvent('elimination') },
    'apex_legends.knockout': { label: $t('Enemy Knocked'), evaluate: onEvent('knockout') },

    // Battlefield 6
    'battlefield_6.game_start': { label: $t('Game Started'), evaluate: onEvent('game_start') },
    'battlefield_6.game_end': { label: $t('Game Ended'), evaluate: onEvent('game_end') },
    'battlefield_6.victory': { label: $t('Victory'), evaluate: onEvent('victory') },
    'battlefield_6.defeat': { label: $t('Defeat'), evaluate: onEvent('defeat') },
    'battlefield_6.elimination': {
      label: $t('Enemy Eliminated'),
      evaluate: onEvent('elimination'),
    },
    'battlefield_6.player_eliminated': {
      label: $t('Player Eliminated'),
      evaluate: onEvent('death'),
    },

    // Dead by Daylight
    'dead_by_daylight.game_start': { label: $t('Match Started'), evaluate: onEvent('game_start') },
    'dead_by_daylight.game_end': { label: $t('Match Ended'), evaluate: onEvent('game_end') },
    'dead_by_daylight.victory': { label: $t('Victory'), evaluate: onEvent('victory') },
    'dead_by_daylight.player_eliminated': {
      label: $t('Player Sacrificed / Eliminated'),
      evaluate: onEvent('death'),
    },
    'dead_by_daylight.elimination': {
      label: $t('Survivor Sacrificed (Killer)'),
      evaluate: onEvent('elimination'),
    },
    'dead_by_daylight.hooked_survivor': {
      label: $t('Survivor Hooked'),
      evaluate: onEvent('hooked_survivor'),
    },
    'dead_by_daylight.escaped': { label: $t('Survivor Escaped'), evaluate: onEvent('escaped') },

    // Deadlock
    'deadlock.game_start': { label: $t('Game Started'), evaluate: onEvent('game_start') },
    'deadlock.game_end': { label: $t('Game Ended'), evaluate: onEvent('game_end') },
    'deadlock.victory': { label: $t('Victory'), evaluate: onEvent('victory') },
    'deadlock.defeat': { label: $t('Defeat'), evaluate: onEvent('defeat') },
    'deadlock.elimination': { label: $t('Enemy Eliminated'), evaluate: onEvent('elimination') },
    'deadlock.player_eliminated': { label: $t('Player Eliminated'), evaluate: onEvent('death') },

    // Dota 2
    'dota_2.game_start': { label: $t('Game Started'), evaluate: onEvent('game_start') },
    'dota_2.game_end': { label: $t('Game Ended'), evaluate: onEvent('game_end') },
    'dota_2.victory': { label: $t('Victory'), evaluate: onEvent('victory') },
    'dota_2.defeat': { label: $t('Defeat'), evaluate: onEvent('defeat') },
    'dota_2.elimination': { label: $t('Hero Kill'), evaluate: onEvent('elimination') },
    'dota_2.player_eliminated': { label: $t('Player Died'), evaluate: onEvent('death') },
    'dota_2.tower_destroyed': {
      label: $t('Tower Destroyed'),
      evaluate: onEvent('tower_destroyed'),
    },
    'dota_2.glyph_used': {
      label: $t('Glyph of Fortification Used'),
      evaluate: onEvent('glyph_used'),
    },

    // League of Legends
    'league_of_legends.game_start': { label: $t('Game Started'), evaluate: onEvent('game_start') },
    'league_of_legends.game_end': { label: $t('Game Ended'), evaluate: onEvent('game_end') },
    'league_of_legends.victory': { label: $t('Victory'), evaluate: onEvent('victory') },
    'league_of_legends.defeat': { label: $t('Defeat'), evaluate: onEvent('defeat') },
    'league_of_legends.elimination': {
      label: $t('Champion Kill'),
      evaluate: onEvent('elimination'),
    },
    'league_of_legends.player_eliminated': { label: $t('Player Died'), evaluate: onEvent('death') },
    'league_of_legends.objective_ally': {
      label: $t('Ally Team Secured Objective'),
      evaluate: onEvent('objective_ally'),
    },
    'league_of_legends.objective_enemy': {
      label: $t('Enemy Team Secured Objective'),
      evaluate: onEvent('objective_enemy'),
    },
    'league_of_legends.enemy_turret_destroyed': {
      label: $t('Enemy Turret Destroyed'),
      evaluate: onEvent('enemy_turret_destroyed'),
    },
    'league_of_legends.ally_turret_destroyed': {
      label: $t('Ally Turret Destroyed'),
      evaluate: onEvent('ally_turret_destroyed'),
    },

    // Marvel Rivals
    'marvel_rivals.game_end': { label: $t('Match Ended'), evaluate: onEvent('game_end') },
    'marvel_rivals.victory': { label: $t('Victory'), evaluate: onEvent('victory') },
    'marvel_rivals.defeat': { label: $t('Defeat'), evaluate: onEvent('defeat') },
    'marvel_rivals.elimination': { label: $t('Hero Eliminated'), evaluate: onEvent('elimination') },
    'marvel_rivals.player_eliminated': {
      label: $t('Player Eliminated'),
      evaluate: onEvent('death'),
    },

    // Overwatch 2
    'overwatch_2.round_start': { label: $t('Round Started'), evaluate: onEvent('round_start') },
    'overwatch_2.round_end': { label: $t('Round Ended'), evaluate: onEvent('round_end') },
    'overwatch_2.victory': { label: $t('Victory'), evaluate: onEvent('victory') },
    'overwatch_2.defeat': { label: $t('Defeat'), evaluate: onEvent('defeat') },
    'overwatch_2.elimination': { label: $t('Elimination'), evaluate: onEvent('elimination') },
    'overwatch_2.player_eliminated': { label: $t('Player Eliminated'), evaluate: onEvent('death') },

    // Rainbow Six Siege
    'rainbow_six_siege.round_start': {
      label: $t('Round Started (Preparation Phase)'),
      evaluate: onEvent('round_start'),
    },
    'rainbow_six_siege.action_phase': {
      label: $t('Action Phase Started'),
      evaluate: onEvent('action_phase'),
    },
    'rainbow_six_siege.round_end': { label: $t('Round Ended'), evaluate: onEvent('round_end') },
    'rainbow_six_siege.victory': { label: $t('Round Won'), evaluate: onEvent('victory') },
    'rainbow_six_siege.defeat': { label: $t('Round Lost'), evaluate: onEvent('defeat') },
    'rainbow_six_siege.elimination': {
      label: $t('Enemy Eliminated'),
      evaluate: onEvent('elimination'),
    },
    'rainbow_six_siege.player_eliminated': {
      label: $t('Player Eliminated'),
      evaluate: onEvent('death'),
    },

    // War Thunder
    'war_thunder.elimination': { label: $t('Target Destroyed'), evaluate: onEvent('elimination') },

    // Marathon
    'marathon.game_start': { label: $t('Match Started'), evaluate: onEvent('game_start') },
    'marathon.game_end': { label: $t('Match Ended'), evaluate: onEvent('game_end') },
    'marathon.victory': { label: $t('Exfiltrated (Victory)'), evaluate: onEvent('victory') },
    'marathon.defeat': { label: $t('Eliminated (Defeat)'), evaluate: onEvent('defeat') },
    'marathon.player_knocked': { label: $t('Player Knocked'), evaluate: onEvent('player_knocked') },
    'marathon.player_eliminated': { label: $t('Player Eliminated'), evaluate: onEvent('death') },
    'marathon.elimination': { label: $t('Runner Eliminated'), evaluate: onEvent('elimination') },
    'marathon.knockout': { label: $t('Runner Knocked'), evaluate: onEvent('knockout') },

    // F1 25
    'f1_25.game_start': { label: $t('Race Started'), evaluate: onEvent('game_start') },
    'f1_25.game_end': { label: $t('Race Ended (Chequered Flag)'), evaluate: onEvent('game_end') },
    'f1_25.victory': { label: $t('Race Win (P1)'), evaluate: onEvent('victory') },
    'f1_25.position_change': {
      label: $t('Race Position Changed'),
      evaluate: onEvent('position_change'),
    },
    'f1_25.lap_change': { label: $t('New Lap Started'), evaluate: onEvent('lap_change') },

    // EA Sports FC 26
    'ea_sports_fc_26.game_start': { label: $t('Match Started'), evaluate: onEvent('game_start') },
    'ea_sports_fc_26.game_end': { label: $t('Match Ended'), evaluate: onEvent('game_end') },
    'ea_sports_fc_26.goal': { label: $t('Goal Scored'), evaluate: onEvent('goal') },
    'ea_sports_fc_26.set_piece': { label: $t('Set Piece'), evaluate: onEvent('set_piece') },
    'ea_sports_fc_26.halftime': { label: $t('Half Time'), evaluate: onEvent('halftime') },
    'ea_sports_fc_26.fulltime': { label: $t('Full Time'), evaluate: onEvent('fulltime') },

    // NBA 2K26
    'nba_2k26.game_start': { label: $t('Game Started'), evaluate: onEvent('game_start') },
    'nba_2k26.game_end': { label: $t('Game Ended (Final)'), evaluate: onEvent('game_end') },
    'nba_2k26.goal': { label: $t('Basket Scored'), evaluate: onEvent('goal') },
    'nba_2k26.halftime': { label: $t('Halftime'), evaluate: onEvent('halftime') },

    // Forza Horizon 6
    'forza_horizon_6.game_start': { label: $t('Race Started'), evaluate: onEvent('game_start') },
    'forza_horizon_6.game_end': { label: $t('Race Finished'), evaluate: onEvent('game_end') },
    'forza_horizon_6.position_change': {
      label: $t('Race Position Changed'),
      evaluate: onEvent('position_change'),
    },
    'forza_horizon_6.lap_change': { label: $t('New Lap Started'), evaluate: onEvent('lap_change') },
    'forza_horizon_6.great_drift': { label: $t('Great Drift'), evaluate: onEvent('great_drift') },
    'forza_horizon_6.great_air': { label: $t('Great Air'), evaluate: onEvent('great_air') },
    'forza_horizon_6.great_skill_chain': {
      label: $t('Great Skill Chain'),
      evaluate: onEvent('great_skill_chain'),
    },

    // Enshrouded
    'enshrouded.player_eliminated': { label: $t('Player Eliminated'), evaluate: onEvent('death') },
    'enshrouded.level_up': { label: $t('Level Up'), evaluate: onEvent('level_up') },
    'enshrouded.soul_discovered': {
      label: $t('Soul Discovered'),
      evaluate: onEvent('soul_discovered'),
    },
    'enshrouded.quest_update': { label: $t('Quest Updated'), evaluate: onEvent('quest_update') },

    // 7 Days to Die
    '7_days_to_die.player_eliminated': { label: $t('Player Died'), evaluate: onEvent('death') },
    '7_days_to_die.low_health': { label: $t('Low Health'), evaluate: onEvent('low_health') },
    '7_days_to_die.blood_moon_start': {
      label: $t('Blood Moon Started'),
      evaluate: onEvent('blood_moon_start'),
    },
    '7_days_to_die.blood_moon_peak': {
      label: $t('Blood Moon Peak'),
      evaluate: onEvent('blood_moon_peak'),
    },
    '7_days_to_die.blood_moon_end': {
      label: $t('Blood Moon Ended'),
      evaluate: onEvent('blood_moon_end'),
    },

    // Arena Breakout: Infinite
    'arena_breakout_infinite.game_start': {
      label: $t('Raid Started'),
      evaluate: onEvent('game_start'),
    },
    'arena_breakout_infinite.game_end': { label: $t('Raid Ended'), evaluate: onEvent('game_end') },
    'arena_breakout_infinite.victory': {
      label: $t('Extracted (Victory)'),
      evaluate: onEvent('victory'),
    },
    'arena_breakout_infinite.defeat': { label: $t('Defeat'), evaluate: onEvent('defeat') },
    'arena_breakout_infinite.player_eliminated': {
      label: $t('Player Eliminated'),
      evaluate: onEvent('death'),
    },
    'arena_breakout_infinite.enemy_spotted': {
      label: $t('Enemy Spotted'),
      evaluate: onEvent('enemy_spotted'),
    },
    'arena_breakout_infinite.enemy_detected': {
      label: $t('Enemy Detected'),
      evaluate: onEvent('enemy_detected'),
    },

    // Bloodborne
    'bloodborne.boss_killed': { label: $t('Boss Killed'), evaluate: onEvent('boss_killed') },
    'bloodborne.player_eliminated': { label: $t('Player Died'), evaluate: onEvent('death') },

    // Dark Souls II
    'dark_souls_2.boss_killed': { label: $t('Boss Killed'), evaluate: onEvent('boss_killed') },
    'dark_souls_2.player_eliminated': { label: $t('Player Died'), evaluate: onEvent('death') },

    // Dark Souls III
    'dark_souls_3.boss_killed': { label: $t('Boss Killed'), evaluate: onEvent('boss_killed') },
    'dark_souls_3.player_eliminated': { label: $t('Player Died'), evaluate: onEvent('death') },

    // Dark Souls: Remastered
    'dark_souls_remastered.boss_killed': {
      label: $t('Boss Killed'),
      evaluate: onEvent('boss_killed'),
    },
    'dark_souls_remastered.player_eliminated': {
      label: $t('Player Died'),
      evaluate: onEvent('death'),
    },

    // DayZ
    'dayz.player_eliminated': { label: $t('Player Died'), evaluate: onEvent('death') },

    // Delta Force
    'delta_force.game_end': { label: $t('Match Ended'), evaluate: onEvent('game_end') },
    'delta_force.victory': { label: $t('Victory'), evaluate: onEvent('victory') },
    'delta_force.defeat': { label: $t('Defeat'), evaluate: onEvent('defeat') },
    'delta_force.elimination': { label: $t('Enemy Eliminated'), evaluate: onEvent('elimination') },
    'delta_force.assist': { label: $t('Assist'), evaluate: onEvent('assist') },
    'delta_force.revive': { label: $t('Revive'), evaluate: onEvent('revive') },
    'delta_force.capturing_objective': {
      label: $t('Capturing Objective'),
      evaluate: onEvent('capturing_objective'),
    },
    'delta_force.captured_objective': {
      label: $t('Objective Captured'),
      evaluate: onEvent('captured_objective'),
    },
    'delta_force.player_eliminated': { label: $t('Player Eliminated'), evaluate: onEvent('death') },

    // Elden Ring
    'elden_ring.boss_killed': { label: $t('Boss Killed'), evaluate: onEvent('boss_killed') },
    'elden_ring.player_eliminated': { label: $t('Player Died'), evaluate: onEvent('death') },

    // Escape from Tarkov
    'escape_from_tarkov.game_start': { label: $t('Raid Started'), evaluate: onEvent('game_start') },
    'escape_from_tarkov.game_end': { label: $t('Raid Ended'), evaluate: onEvent('game_end') },
    'escape_from_tarkov.victory': {
      label: $t('Extracted (Victory)'),
      evaluate: onEvent('victory'),
    },
    'escape_from_tarkov.defeat': { label: $t('Defeat'), evaluate: onEvent('defeat') },
    'escape_from_tarkov.player_eliminated': {
      label: $t('Player Eliminated'),
      evaluate: onEvent('death'),
    },
    'escape_from_tarkov.enemy_spotted': {
      label: $t('Enemy Spotted'),
      evaluate: onEvent('enemy_spotted'),
    },
    'escape_from_tarkov.enemy_detected': {
      label: $t('Enemy Detected'),
      evaluate: onEvent('enemy_detected'),
    },
    'escape_from_tarkov.item_found': { label: $t('Item Found'), evaluate: onEvent('item_found') },
    'escape_from_tarkov.interesting_moment': {
      label: $t('Interesting Moment'),
      evaluate: onEvent('interesting_moment'),
    },

    // Halo Infinite
    'halo_infinite.game_start': { label: $t('Match Started'), evaluate: onEvent('game_start') },
    'halo_infinite.game_end': { label: $t('Match Ended'), evaluate: onEvent('game_end') },
    'halo_infinite.victory': { label: $t('Victory'), evaluate: onEvent('victory') },
    'halo_infinite.defeat': { label: $t('Defeat'), evaluate: onEvent('defeat') },
    'halo_infinite.elimination': {
      label: $t('Enemy Eliminated'),
      evaluate: onEvent('elimination'),
    },
    'halo_infinite.assist': { label: $t('Assist'), evaluate: onEvent('assist') },
    'halo_infinite.captured_objective': {
      label: $t('Objective Captured'),
      evaluate: onEvent('captured_objective'),
    },
    'halo_infinite.player_eliminated': {
      label: $t('Player Eliminated'),
      evaluate: onEvent('death'),
    },

    // Helldivers 2
    'helldivers_2.game_end': { label: $t('Mission Ended'), evaluate: onEvent('game_end') },
    'helldivers_2.victory': { label: $t('Mission Success'), evaluate: onEvent('victory') },
    'helldivers_2.defeat': { label: $t('Mission Failed'), evaluate: onEvent('defeat') },
    'helldivers_2.player_eliminated': { label: $t('Player Died'), evaluate: onEvent('death') },
    'helldivers_2.objective_spawned': {
      label: $t('Objective Spawned'),
      evaluate: onEvent('objective_spawned'),
    },
    'helldivers_2.shuttle_landing': {
      label: $t('Shuttle Landing'),
      evaluate: onEvent('shuttle_landing'),
    },
    'helldivers_2.interesting_moment': {
      label: $t('Interesting Moment'),
      evaluate: onEvent('interesting_moment'),
    },

    // Heroes of the Storm
    'heroes_of_the_storm.game_start': {
      label: $t('Match Started'),
      evaluate: onEvent('game_start'),
    },
    'heroes_of_the_storm.game_end': { label: $t('Match Ended'), evaluate: onEvent('game_end') },
    'heroes_of_the_storm.victory': { label: $t('Victory'), evaluate: onEvent('victory') },
    'heroes_of_the_storm.defeat': { label: $t('Defeat'), evaluate: onEvent('defeat') },
    'heroes_of_the_storm.elimination': { label: $t('Hero Kill'), evaluate: onEvent('elimination') },
    'heroes_of_the_storm.player_eliminated': {
      label: $t('Player Died'),
      evaluate: onEvent('death'),
    },

    // Hunt: Showdown 1896
    'hunt_showdown_1896.game_start': { label: $t('Hunt Started'), evaluate: onEvent('game_start') },
    'hunt_showdown_1896.game_end': { label: $t('Hunt Ended'), evaluate: onEvent('game_end') },
    'hunt_showdown_1896.victory': {
      label: $t('Extracted (Victory)'),
      evaluate: onEvent('victory'),
    },
    'hunt_showdown_1896.elimination': {
      label: $t('Enemy Eliminated'),
      evaluate: onEvent('elimination'),
    },
    'hunt_showdown_1896.player_eliminated': {
      label: $t('Player Died'),
      evaluate: onEvent('death'),
    },
    'hunt_showdown_1896.objective_spawned': {
      label: $t('Objective Spawned'),
      evaluate: onEvent('objective_spawned'),
    },
    'hunt_showdown_1896.bounty_acquired': {
      label: $t('Bounty Acquired'),
      evaluate: onEvent('bounty_acquired'),
    },
    'hunt_showdown_1896.interesting_moment': {
      label: $t('Interesting Moment'),
      evaluate: onEvent('interesting_moment'),
    },

    // Left 4 Dead 2
    'left_4_dead_2.elimination': {
      label: $t('Special Infected Killed'),
      evaluate: onEvent('elimination'),
    },
    'left_4_dead_2.player_eliminated': { label: $t('Player Died'), evaluate: onEvent('death') },
    'left_4_dead_2.healing': { label: $t('Healing'), evaluate: onEvent('healing') },
    'left_4_dead_2.interesting_moment': {
      label: $t('Interesting Moment'),
      evaluate: onEvent('interesting_moment'),
    },

    // Madden NFL 27
    'madden_nfl_27.game_start': { label: $t('Game Started'), evaluate: onEvent('game_start') },
    'madden_nfl_27.game_end': { label: $t('Game Ended'), evaluate: onEvent('game_end') },
    'madden_nfl_27.goal': { label: $t('Score Changed'), evaluate: onEvent('goal') },
    'madden_nfl_27.touchdown': { label: $t('Touchdown'), evaluate: onEvent('touchdown') },
    'madden_nfl_27.field_goal': { label: $t('Field Goal'), evaluate: onEvent('field_goal') },
    'madden_nfl_27.halftime': { label: $t('Halftime'), evaluate: onEvent('halftime') },
    'madden_nfl_27.final_score': { label: $t('Final Score'), evaluate: onEvent('final_score') },

    // Mortal Shell 2
    'mortal_shell_2.boss_killed': { label: $t('Boss Killed'), evaluate: onEvent('boss_killed') },
    'mortal_shell_2.item_found': { label: $t('Item Found'), evaluate: onEvent('item_found') },
    'mortal_shell_2.player_eliminated': { label: $t('Player Died'), evaluate: onEvent('death') },

    // Palworld
    'palworld.boss_killed': { label: $t('Boss Killed'), evaluate: onEvent('boss_killed') },
    'palworld.new_pal_captured': {
      label: $t('New Pal Captured'),
      evaluate: onEvent('new_pal_captured'),
    },
    'palworld.player_eliminated': { label: $t('Player Died'), evaluate: onEvent('death') },

    // Rust
    'rust.player_knocked': { label: $t('Player Knocked'), evaluate: onEvent('player_knocked') },
    'rust.player_eliminated': { label: $t('Player Died'), evaluate: onEvent('death') },
    'rust.interesting_moment': {
      label: $t('Interesting Moment'),
      evaluate: onEvent('interesting_moment'),
    },

    // Sekiro: Shadows Die Twice
    'sekiro_shadows_die_twice.boss_killed': {
      label: $t('Boss Killed'),
      evaluate: onEvent('boss_killed'),
    },
    'sekiro_shadows_die_twice.player_eliminated': {
      label: $t('Player Died'),
      evaluate: onEvent('death'),
    },

    // Teamfight Tactics
    'teamfight_tactics.game_start': { label: $t('Match Started'), evaluate: onEvent('game_start') },
    'teamfight_tactics.game_end': { label: $t('Match Ended'), evaluate: onEvent('game_end') },
    'teamfight_tactics.victory': { label: $t('Victory'), evaluate: onEvent('victory') },
    'teamfight_tactics.defeat': { label: $t('Defeat'), evaluate: onEvent('defeat') },
    'teamfight_tactics.interesting_moment': {
      label: $t('Interesting Moment'),
      evaluate: onEvent('interesting_moment'),
    },

    // Valheim
    'valheim.advancement_made': {
      label: $t('Advancement Made'),
      evaluate: onEvent('advancement_made'),
    },
    'valheim.boss_spawned': { label: $t('Boss Spawned'), evaluate: onEvent('boss_spawned') },
    'valheim.boss_killed': { label: $t('Boss Killed'), evaluate: onEvent('boss_killed') },
    'valheim.player_eliminated': { label: $t('Player Died'), evaluate: onEvent('death') },
    'valheim.hunt_start': { label: $t('Hunt Started'), evaluate: onEvent('hunt_start') },
    'valheim.hunt_end': { label: $t('Hunt Ended'), evaluate: onEvent('hunt_end') },

    // World of Warcraft: Solo Shuffle
    'world_of_warcraft_ss.game_start': {
      label: $t('Match Started'),
      evaluate: onEvent('game_start'),
    },
    'world_of_warcraft_ss.game_end': { label: $t('Match Ended'), evaluate: onEvent('game_end') },
    'world_of_warcraft_ss.round_start': {
      label: $t('Round Started'),
      evaluate: onEvent('round_start'),
    },
    'world_of_warcraft_ss.round_won': { label: $t('Round Won'), evaluate: onEvent('round_won') },
    'world_of_warcraft_ss.round_lost': { label: $t('Round Lost'), evaluate: onEvent('round_lost') },
    'world_of_warcraft_ss.victory': { label: $t('Victory'), evaluate: onEvent('victory') },
    'world_of_warcraft_ss.defeat': { label: $t('Defeat'), evaluate: onEvent('defeat') },
    'world_of_warcraft_ss.draw': { label: $t('Draw'), evaluate: onEvent('draw') },
  } as const);

export const Conditions = () =>
  Object.fromEntries(
    Object.entries(perGameConditions()).map(([type, def]) => [
      type,
      { ...def, group: type.split('.')[0] },
    ]),
  ) as { [K in ConditionType]: RegisteredCondition<K> };

export const GAME_NAMES: Record<string, string> = {
  fortnite: 'Fortnite',
  pubg: 'PUBG: Battlegrounds',
  valorant: 'Valorant',
  counter_strike_2: 'Counter-Strike 2',
  black_ops_6: 'Call of Duty: Black Ops 6',
  warzone: 'Call of Duty: Warzone',
  rocket_league: 'Rocket League',
  arc_raiders: 'Arc Raiders',
  minecraft: 'Minecraft',
  apex_legends: 'Apex Legends',
  battlefield_6: 'Battlefield 6',
  dead_by_daylight: 'Dead by Daylight',
  deadlock: 'Deadlock',
  dota_2: 'Dota 2',
  league_of_legends: 'League of Legends',
  marvel_rivals: 'Marvel Rivals',
  overwatch_2: 'Overwatch 2',
  rainbow_six_siege: 'Rainbow Six Siege',
  war_thunder: 'War Thunder',
  marathon: 'Marathon',
  f1_25: 'F1 25',
  ea_sports_fc_26: 'EA Sports FC 26',
  nba_2k26: 'NBA 2K26',
  forza_horizon_6: 'Forza Horizon 6',
  enshrouded: 'Enshrouded',
  '7_days_to_die': '7 Days to Die',
  arena_breakout_infinite: 'Arena Breakout: Infinite',
  bloodborne: 'Bloodborne',
  dark_souls_2: 'Dark Souls II',
  dark_souls_3: 'Dark Souls III',
  dark_souls_remastered: 'Dark Souls: Remastered',
  dayz: 'DayZ',
  delta_force: 'Delta Force',
  elden_ring: 'Elden Ring',
  escape_from_tarkov: 'Escape from Tarkov',
  halo_infinite: 'Halo Infinite',
  helldivers_2: 'Helldivers 2',
  heroes_of_the_storm: 'Heroes of the Storm',
  hunt_showdown_1896: 'Hunt: Showdown 1896',
  left_4_dead_2: 'Left 4 Dead 2',
  madden_nfl_27: 'Madden NFL 27',
  mortal_shell_2: 'Mortal Shell 2',
  palworld: 'Palworld',
  rust: 'Rust',
  sekiro_shadows_die_twice: 'Sekiro: Shadows Die Twice',
  teamfight_tactics: 'Teamfight Tactics',
  valheim: 'Valheim',
  world_of_warcraft_ss: 'World of Warcraft: Solo Shuffle',
};

export type TCondition<T extends ConditionType = ConditionType> = {
  type: T;
  props?: ConditionProps<T>;
};

export type TEvaluatedCondition<T extends TCondition = TCondition> = {
  condition: T;
  status: boolean;
};

export class ConditionsManager {
  static evaluate({
    condition,
    state,
    prevState,
  }: {
    condition: TCondition;
    state: GameState;
    prevState: GameState;
  }) {
    const def = Conditions()[condition.type];
    if (!def) {
      throw new Error(`Condition type "${condition.type}" not found`);
    }

    const evaluateFn = (def as ConditionDefinition<typeof condition.type>).evaluate;
    return evaluateFn({
      state,
      prevState,
      props: condition.props as ConditionProps<typeof condition.type>,
    });
  }
}
