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
  label: 'Enemy Elimination Count',
  properties: {
    elimination_count: new Properties.SliderRange({
      label: '# of Eliminations',
      min: 0,
      max: 50,
      default: [5, 5],
      step: 1,
    }),
  },
  evaluate: ({ state, prevState, props }: EvalArgs<{ elimination_count?: [number, number] }>) => {
    const [min, max] = props?.elimination_count ?? [5, 5];
    const { eliminations = 0 } = state;
    const { eliminations: prevEliminations = 0 } = prevState;
    return eliminations >= min && prevEliminations <= max;
  },
});

const playersRemaining = (sliderMax: number) => ({
  label: 'Players Remaining (coming soon)',
  disabled: true,
  properties: {
    players_remaining: new Properties.SliderRange({
      label: '# of Players Remaining',
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

const perGameConditions = {
  // Fortnite
  'fortnite.game_started': { label: 'Game Started', evaluate: onEvent('game_start') },
  'fortnite.deployed': { label: 'Deployed', evaluate: onEvent('deploy') },
  'fortnite.game_ended': { label: 'Game Ended', evaluate: onEvent('game_end') },
  'fortnite.low_health': { label: 'Low Health', evaluate: lowHealth },
  'fortnite.has_shield': { label: 'Has Shield', evaluate: hasShield },
  'fortnite.no_shield': { label: 'No Shield', evaluate: noShield },
  'fortnite.victory_royale': { label: 'Victory Royale', evaluate: onEvent('victory') },
  'fortnite.defeat': { label: 'Defeat', evaluate: onEvent('defeat') },
  'fortnite.player_eliminated': { label: 'Player Eliminated', evaluate: onEvent('death') },
  'fortnite.player_knocked': { label: 'Player Knocked', evaluate: onEvent('player_knocked') },
  'fortnite.storm_closing': { label: 'Storm Closing', evaluate: onEvent('storm_shrinking') },
  'fortnite.elimination': { label: 'Enemy Eliminated', evaluate: onEvent('elimination') },
  'fortnite.knocked': { label: 'Enemy Knocked', evaluate: onEvent('knockout') },
  'fortnite.elimination_count': eliminationCount(),
  'fortnite.players_remaining': playersRemaining(100),

  // PUBG
  'pubg.game_started': { label: 'Game Started', evaluate: onEvent('game_start') },
  'pubg.deployed': { label: 'Deployed', evaluate: onEvent('deploy') },
  'pubg.storm_closing': { label: 'Storm Closing', evaluate: onEvent('storm_shrinking') },
  'pubg.game_ended': { label: 'Game Ended', evaluate: onEvent('game_end') },
  'pubg.victory': { label: 'Victory', evaluate: onEvent('victory') },
  'pubg.defeat': { label: 'Defeat', evaluate: onEvent('defeat') },
  'pubg.player_eliminated': { label: 'Player Eliminated', evaluate: onEvent('death') },
  'pubg.player_knocked': { label: 'Player Knocked', evaluate: onEvent('player_knocked') },
  'pubg.elimination': { label: 'Enemy Eliminated', evaluate: onEvent('elimination') },
  'pubg.knocked': { label: 'Enemy Knocked', evaluate: onEvent('knockout') },
  'pubg.elimination_count': eliminationCount(),
  'pubg.players_remaining': playersRemaining(100),

  // Valorant
  'valorant.round_started': { label: 'Round Started', evaluate: onEvent('game_start') },
  'valorant.low_health': { label: 'Low Health', evaluate: lowHealth },
  'valorant.victory': { label: 'Victory', evaluate: onEvent('victory') },
  'valorant.defeat': { label: 'Defeat', evaluate: onEvent('defeat') },
  'valorant.player_eliminated': { label: 'Player Eliminated', evaluate: onEvent('death') },
  'valorant.elimination': { label: 'Enemy Eliminated', evaluate: onEvent('elimination') },
  'valorant.elimination_count': eliminationCount(),

  // Counter-Strike 2
  'counter_strike_2.round_started': { label: 'Round Started', evaluate: onEvent('game_start') },
  'counter_strike_2.low_health': { label: 'Low Health', evaluate: lowHealth },
  'counter_strike_2.victory': { label: 'Victory', evaluate: onEvent('victory') },
  'counter_strike_2.defeat': { label: 'Defeat', evaluate: onEvent('defeat') },
  'counter_strike_2.player_eliminated': { label: 'Player Eliminated', evaluate: onEvent('death') },
  'counter_strike_2.elimination': { label: 'Enemy Eliminated', evaluate: onEvent('elimination') },
  'counter_strike_2.elimination_count': eliminationCount(),
  'counter_strike_2.first_half': { label: 'First Half', evaluate: onEvent('first_half') },
  'counter_strike_2.second_half': { label: 'Second Half', evaluate: onEvent('second_half') },
  'counter_strike_2.round_won': { label: 'Round Won', evaluate: onEvent('round_won') },
  'counter_strike_2.round_lost': { label: 'Round Lost', evaluate: onEvent('round_lost') },
  'counter_strike_2.game_ended': { label: 'Game Ended', evaluate: onEvent('game_end') },

  // Warzone
  'warzone.deploy': { label: 'Deploy', evaluate: onEvent('deploy') },
  'warzone.elimination': { label: 'Enemy Eliminated', evaluate: onEvent('elimination') },
  'warzone.knockout': { label: 'Enemy Downed', evaluate: onEvent('knockout') },
  'warzone.player_knocked': { label: 'Player Downed', evaluate: onEvent('player_knocked') },
  'warzone.player_eliminated': { label: 'Player Eliminated', evaluate: onEvent('death') },
  'warzone.victory': { label: 'Victory', evaluate: onEvent('victory') },
  'warzone.defeat': { label: 'Defeat', evaluate: onEvent('defeat') },
  'warzone.gulag_start': { label: 'Gulag Started', evaluate: onEvent('gulag_start') },
  'warzone.gulag_end': { label: 'Gulag Ended', evaluate: onEvent('gulag_end') },
  'warzone.spectating': { label: 'Spectating', evaluate: onEvent('spectating') },
  'warzone.redeploying': { label: 'Redeploying', evaluate: onEvent('redeploying') },
  'warzone.elimination_count': eliminationCount(),
  'warzone.players_remaining': playersRemaining(150),

  // Arc Raiders
  'arc_raiders.game_start': { label: 'Game Started', evaluate: onEvent('game_start') },
  'arc_raiders.game_end': { label: 'Game Ended', evaluate: onEvent('game_end') },
  'arc_raiders.victory': { label: 'Victory', evaluate: onEvent('victory') },
  'arc_raiders.defeat': { label: 'Defeat', evaluate: onEvent('defeat') },
  'arc_raiders.player_knocked': { label: 'Player Knocked', evaluate: onEvent('player_knocked') },
  'arc_raiders.player_eliminated': { label: 'Player Eliminated', evaluate: onEvent('death') },
  'arc_raiders.enemy_spotted': { label: 'Enemy Spotted', evaluate: onEvent('enemy_spotted') },
  'arc_raiders.enemy_detected': { label: 'Enemy Detected', evaluate: onEvent('enemy_detected') },
  'arc_raiders.interesting_moment': {
    label: 'Interesting Moment',
    evaluate: onEvent('interesting_moment'),
  },

  // Call of Duty: Black Ops 6
  'black_ops_6.elimination': { label: 'Enemy Eliminated', evaluate: onEvent('elimination') },
  'black_ops_6.victory': { label: 'Victory', evaluate: onEvent('victory') },
  'black_ops_6.defeat': { label: 'Defeat', evaluate: onEvent('defeat') },
  'black_ops_6.spectating': { label: 'Spectating', evaluate: onEvent('spectating') },

  // Rocket League
  'rocket_league.game_start': { label: 'Game Started', evaluate: onEvent('game_start') },
  'rocket_league.game_end': { label: 'Game Ended', evaluate: onEvent('game_end') },
  'rocket_league.team_scored': { label: 'Team Scored', evaluate: onEvent('team_scored') },
  'rocket_league.opponent_scored': {
    label: 'Opponent Scored',
    evaluate: onEvent('opponent_scored'),
  },
  'rocket_league.victory': { label: 'Victory', evaluate: onEvent('victory') },
  'rocket_league.defeat': { label: 'Defeat', evaluate: onEvent('defeat') },

  // Minecraft
  'minecraft.ender_dragon_spawned': {
    label: 'Ender Dragon Spawned',
    evaluate: onEvent('ender_dragon_spawned'),
  },
  'minecraft.boss_killed': { label: 'Boss Killed', evaluate: onEvent('boss_killed') },
  'minecraft.wither_spawned': { label: 'Wither Spawned', evaluate: onEvent('wither_spawned') },
  'minecraft.advancement_made': {
    label: 'Advancement Made',
    evaluate: onEvent('advancement_made'),
  },
  'minecraft.first_diamond': { label: 'First Diamond', evaluate: onEvent('first_diamond') },
  'minecraft.nether_entered': { label: 'Nether Entered', evaluate: onEvent('nether_entered') },
  'minecraft.player_eliminated': { label: 'Player Eliminated', evaluate: onEvent('death') },
  // Edge-triggered: fires only on the tick health first drops into the danger zone.
  'minecraft.low_health': {
    label: 'Low Health',
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
    label: 'Totem of Undying Used',
    evaluate: onEvent('totem_of_undying_used'),
  },

  // Apex Legends
  'apex_legends.game_start': { label: 'Game Started', evaluate: onEvent('game_start') },
  'apex_legends.deploy': { label: 'Deployed', evaluate: onEvent('deploy') },
  'apex_legends.storm_shrinking': { label: 'Ring Closing', evaluate: onEvent('storm_shrinking') },
  'apex_legends.game_end': { label: 'Game Ended', evaluate: onEvent('game_end') },
  'apex_legends.player_knocked': { label: 'Player Knocked', evaluate: onEvent('player_knocked') },
  'apex_legends.player_revived': { label: 'Player Revived', evaluate: onEvent('player_revived') },
  'apex_legends.player_eliminated': { label: 'Player Eliminated', evaluate: onEvent('death') },
  'apex_legends.victory': { label: 'Victory (Champion)', evaluate: onEvent('victory') },
  'apex_legends.defeat': { label: 'Defeat', evaluate: onEvent('defeat') },
  'apex_legends.elimination': { label: 'Enemy Eliminated', evaluate: onEvent('elimination') },
  'apex_legends.knockout': { label: 'Enemy Knocked', evaluate: onEvent('knockout') },

  // Battlefield 6
  'battlefield_6.game_start': { label: 'Game Started', evaluate: onEvent('game_start') },
  'battlefield_6.game_end': { label: 'Game Ended', evaluate: onEvent('game_end') },
  'battlefield_6.victory': { label: 'Victory', evaluate: onEvent('victory') },
  'battlefield_6.defeat': { label: 'Defeat', evaluate: onEvent('defeat') },
  'battlefield_6.elimination': { label: 'Enemy Eliminated', evaluate: onEvent('elimination') },
  'battlefield_6.player_eliminated': { label: 'Player Eliminated', evaluate: onEvent('death') },

  // Dead by Daylight
  'dead_by_daylight.game_start': { label: 'Match Started', evaluate: onEvent('game_start') },
  'dead_by_daylight.game_end': { label: 'Match Ended', evaluate: onEvent('game_end') },
  'dead_by_daylight.victory': { label: 'Victory', evaluate: onEvent('victory') },
  'dead_by_daylight.player_eliminated': {
    label: 'Player Sacrificed / Eliminated',
    evaluate: onEvent('death'),
  },
  'dead_by_daylight.elimination': {
    label: 'Survivor Sacrificed (Killer)',
    evaluate: onEvent('elimination'),
  },
  'dead_by_daylight.hooked_survivor': {
    label: 'Survivor Hooked',
    evaluate: onEvent('hooked_survivor'),
  },
  'dead_by_daylight.escaped': { label: 'Survivor Escaped', evaluate: onEvent('escaped') },

  // Deadlock
  'deadlock.game_start': { label: 'Game Started', evaluate: onEvent('game_start') },
  'deadlock.game_end': { label: 'Game Ended', evaluate: onEvent('game_end') },
  'deadlock.victory': { label: 'Victory', evaluate: onEvent('victory') },
  'deadlock.defeat': { label: 'Defeat', evaluate: onEvent('defeat') },
  'deadlock.elimination': { label: 'Enemy Eliminated', evaluate: onEvent('elimination') },
  'deadlock.player_eliminated': { label: 'Player Eliminated', evaluate: onEvent('death') },

  // Dota 2
  'dota_2.game_start': { label: 'Game Started', evaluate: onEvent('game_start') },
  'dota_2.game_end': { label: 'Game Ended', evaluate: onEvent('game_end') },
  'dota_2.victory': { label: 'Victory', evaluate: onEvent('victory') },
  'dota_2.defeat': { label: 'Defeat', evaluate: onEvent('defeat') },
  'dota_2.elimination': { label: 'Hero Kill', evaluate: onEvent('elimination') },
  'dota_2.player_eliminated': { label: 'Player Died', evaluate: onEvent('death') },
  'dota_2.tower_destroyed': { label: 'Tower Destroyed', evaluate: onEvent('tower_destroyed') },
  'dota_2.glyph_used': { label: 'Glyph of Fortification Used', evaluate: onEvent('glyph_used') },

  // League of Legends
  'league_of_legends.game_start': { label: 'Game Started', evaluate: onEvent('game_start') },
  'league_of_legends.game_end': { label: 'Game Ended', evaluate: onEvent('game_end') },
  'league_of_legends.victory': { label: 'Victory', evaluate: onEvent('victory') },
  'league_of_legends.defeat': { label: 'Defeat', evaluate: onEvent('defeat') },
  'league_of_legends.elimination': { label: 'Champion Kill', evaluate: onEvent('elimination') },
  'league_of_legends.player_eliminated': { label: 'Player Died', evaluate: onEvent('death') },
  'league_of_legends.objective_ally': {
    label: 'Ally Team Secured Objective',
    evaluate: onEvent('objective_ally'),
  },
  'league_of_legends.objective_enemy': {
    label: 'Enemy Team Secured Objective',
    evaluate: onEvent('objective_enemy'),
  },
  'league_of_legends.enemy_turret_destroyed': {
    label: 'Enemy Turret Destroyed',
    evaluate: onEvent('enemy_turret_destroyed'),
  },
  'league_of_legends.ally_turret_destroyed': {
    label: 'Ally Turret Destroyed',
    evaluate: onEvent('ally_turret_destroyed'),
  },

  // Marvel Rivals
  'marvel_rivals.game_end': { label: 'Match Ended', evaluate: onEvent('game_end') },
  'marvel_rivals.victory': { label: 'Victory', evaluate: onEvent('victory') },
  'marvel_rivals.defeat': { label: 'Defeat', evaluate: onEvent('defeat') },
  'marvel_rivals.elimination': { label: 'Hero Eliminated', evaluate: onEvent('elimination') },
  'marvel_rivals.player_eliminated': { label: 'Player Eliminated', evaluate: onEvent('death') },

  // Overwatch 2
  'overwatch_2.round_start': { label: 'Round Started', evaluate: onEvent('game_start') },
  'overwatch_2.round_end': { label: 'Round Ended', evaluate: onEvent('game_end') },
  'overwatch_2.victory': { label: 'Victory', evaluate: onEvent('victory') },
  'overwatch_2.defeat': { label: 'Defeat', evaluate: onEvent('defeat') },
  'overwatch_2.elimination': { label: 'Elimination', evaluate: onEvent('elimination') },
  'overwatch_2.player_eliminated': { label: 'Player Eliminated', evaluate: onEvent('death') },

  // Rainbow Six Siege
  'rainbow_six_siege.round_start': {
    label: 'Round Started (Preparation Phase)',
    evaluate: onEvent('game_start'),
  },
  'rainbow_six_siege.action_phase': {
    label: 'Action Phase Started',
    evaluate: onEvent('action_phase'),
  },
  'rainbow_six_siege.round_end': { label: 'Round Ended', evaluate: onEvent('game_end') },
  'rainbow_six_siege.victory': { label: 'Round Won', evaluate: onEvent('victory') },
  'rainbow_six_siege.defeat': { label: 'Round Lost', evaluate: onEvent('defeat') },
  'rainbow_six_siege.elimination': { label: 'Enemy Eliminated', evaluate: onEvent('elimination') },
  'rainbow_six_siege.player_eliminated': { label: 'Player Eliminated', evaluate: onEvent('death') },

  // War Thunder
  'war_thunder.elimination': { label: 'Target Destroyed', evaluate: onEvent('elimination') },

  // Marathon
  'marathon.game_start': { label: 'Match Started', evaluate: onEvent('game_start') },
  'marathon.game_end': { label: 'Match Ended', evaluate: onEvent('game_end') },
  'marathon.victory': { label: 'Exfiltrated (Victory)', evaluate: onEvent('victory') },
  'marathon.defeat': { label: 'Eliminated (Defeat)', evaluate: onEvent('defeat') },
  'marathon.player_knocked': { label: 'Player Knocked', evaluate: onEvent('player_knocked') },
  'marathon.player_eliminated': { label: 'Player Eliminated', evaluate: onEvent('death') },
  'marathon.elimination': { label: 'Runner Eliminated', evaluate: onEvent('elimination') },
  'marathon.knockout': { label: 'Runner Knocked', evaluate: onEvent('knockout') },

  // F1 25
  'f1_25.game_start': { label: 'Race Started', evaluate: onEvent('game_start') },
  'f1_25.game_end': { label: 'Race Ended (Chequered Flag)', evaluate: onEvent('game_end') },
  'f1_25.victory': { label: 'Race Win (P1)', evaluate: onEvent('victory') },
  'f1_25.position_change': { label: 'Race Position Changed', evaluate: onEvent('position_change') },
  'f1_25.lap_change': { label: 'New Lap Started', evaluate: onEvent('lap_change') },

  // EA Sports FC 26
  'ea_sports_fc_26.game_start': { label: 'Match Started', evaluate: onEvent('game_start') },
  'ea_sports_fc_26.game_end': { label: 'Match Ended', evaluate: onEvent('game_end') },
  'ea_sports_fc_26.goal': { label: 'Goal Scored', evaluate: onEvent('goal') },
  'ea_sports_fc_26.set_piece': { label: 'Set Piece', evaluate: onEvent('set_piece') },
  'ea_sports_fc_26.halftime': { label: 'Half Time', evaluate: onEvent('halftime') },
  'ea_sports_fc_26.fulltime': { label: 'Full Time', evaluate: onEvent('fulltime') },

  // NBA 2K26
  'nba_2k26.game_start': { label: 'Game Started', evaluate: onEvent('game_start') },
  'nba_2k26.game_end': { label: 'Game Ended (Final)', evaluate: onEvent('game_end') },
  'nba_2k26.goal': { label: 'Basket Scored', evaluate: onEvent('goal') },
  'nba_2k26.halftime': { label: 'Halftime', evaluate: onEvent('halftime') },

  // Forza Horizon 6
  'forza_horizon_6.game_start': { label: 'Race Started', evaluate: onEvent('game_start') },
  'forza_horizon_6.game_end': { label: 'Race Finished', evaluate: onEvent('game_end') },
  'forza_horizon_6.position_change': {
    label: 'Race Position Changed',
    evaluate: onEvent('position_change'),
  },
  'forza_horizon_6.lap_change': { label: 'New Lap Started', evaluate: onEvent('lap_change') },
  'forza_horizon_6.great_drift': { label: 'Great Drift', evaluate: onEvent('great_drift') },
  'forza_horizon_6.great_air': { label: 'Great Air', evaluate: onEvent('great_air') },
  'forza_horizon_6.great_skill_chain': {
    label: 'Great Skill Chain',
    evaluate: onEvent('great_skill_chain'),
  },

  // Enshrouded
  'enshrouded.player_eliminated': { label: 'Player Eliminated', evaluate: onEvent('death') },
  'enshrouded.level_up': { label: 'Level Up', evaluate: onEvent('level_up') },
  'enshrouded.soul_discovered': { label: 'Soul Discovered', evaluate: onEvent('soul_discovered') },
  'enshrouded.quest_update': { label: 'Quest Updated', evaluate: onEvent('quest_update') },
} as const;

export const Conditions = Object.fromEntries(
  Object.entries(perGameConditions).map(([type, def]) => [
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
    const def = Conditions[condition.type];
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
