import type { ConditionType } from './conditions';

const WORD_LIMIT = '8 words max.';

const withWordLimit = (prompt: string): string => {
  const trimmed = prompt.trim();
  return trimmed.endsWith(WORD_LIMIT) ? trimmed : `${trimmed} ${WORD_LIMIT}`;
};

const perGameInstructions = {
  // Fortnite
  'fortnite.game_started': 'React to the game starting.',
  'fortnite.deployed': 'React to {player} dropping in.',
  'fortnite.storm_closing': 'Warn about the storm closing in.',
  'fortnite.game_ended': 'React to the game ending.',
  'fortnite.low_health': "Panic about {player}'s critically low health.",
  'fortnite.has_shield': 'React to {player} having shield.',
  'fortnite.no_shield': 'Warn {player} they have no shield.',
  'fortnite.victory_royale': "Celebrate {player}'s Victory Royale!",
  'fortnite.player_eliminated': 'React to {player} getting eliminated.',
  'fortnite.player_knocked': 'React to {player} getting knocked.',
  'fortnite.defeat': "React to {player}'s defeat.",
  'fortnite.elimination': 'React to the enemy being eliminated.',
  'fortnite.knocked': 'React to {player} knocking an enemy.',
  'fortnite.elimination_count': 'React to {player} reaching {elimination_count} eliminations.',
  'fortnite.players_remaining': 'Comment on {players_remaining} players remaining.',

  // PUBG
  'pubg.game_started': 'React to the match starting.',
  'pubg.deployed': 'React to {player} parachuting in.',
  'pubg.storm_closing': 'Warn about the blue zone closing.',
  'pubg.game_ended': 'React to the match ending.',
  'pubg.victory': "Celebrate {player}'s chicken dinner!",
  'pubg.player_eliminated': 'React to {player} being eliminated.',
  'pubg.player_knocked': 'React to {player} getting knocked.',
  'pubg.defeat': "React to {player}'s defeat.",
  'pubg.elimination': 'React to an enemy being eliminated.',
  'pubg.knocked': 'React to {player} knocking an enemy.',
  'pubg.elimination_count': 'React to {player} reaching {elimination_count} eliminations.',
  'pubg.players_remaining': 'Comment on {players_remaining} players remaining.',

  // Valorant
  'valorant.round_started': 'React to the round starting.',
  'valorant.low_health': "Panic about {player}'s low health.",
  'valorant.victory': "Celebrate {player}'s team winning.",
  'valorant.player_eliminated': 'React to {player} being eliminated.',
  'valorant.defeat': "React to {player}'s team losing.",
  'valorant.elimination': 'React to an enemy being eliminated.',
  'valorant.elimination_count': 'React to {player} reaching {elimination_count} kills.',

  // Counter-Strike 2
  'counter_strike_2.round_started': 'React to the round starting.',
  'counter_strike_2.first_half': 'React to the first half starting.',
  'counter_strike_2.second_half': 'React to the second half starting.',
  'counter_strike_2.round_won': "React to {player}'s team winning the round.",
  'counter_strike_2.round_lost': "React to {player}'s team losing the round.",
  'counter_strike_2.game_ended': 'React to the match ending.',
  'counter_strike_2.low_health': "Panic about {player}'s low health.",
  'counter_strike_2.victory': "Celebrate {player}'s team winning the match.",
  'counter_strike_2.player_eliminated': 'React to {player} being eliminated.',
  'counter_strike_2.defeat': "React to {player}'s team losing the match.",
  'counter_strike_2.elimination': 'React to an enemy being eliminated.',
  'counter_strike_2.elimination_count': 'React to {player} reaching {elimination_count} kills.',

  // Warzone
  'warzone.deploy': 'React to {player} deploying in.',
  'warzone.gulag_start': 'React to {player} being sent to the Gulag.',
  'warzone.gulag_end': "React to {player}'s Gulag result.",
  'warzone.spectating': 'React to {player} getting eliminated and spectating.',
  'warzone.redeploying': 'React to {player} redeploying back in.',
  'warzone.victory': "Celebrate {player}'s Warzone victory!",
  'warzone.player_knocked': 'React to {player} getting knocked.',
  'warzone.player_eliminated': 'React to {player} being eliminated.',
  'warzone.defeat': "React to {player}'s defeat.",
  'warzone.elimination': 'React to an enemy being eliminated.',
  'warzone.knockout': 'React to an enemy getting knocked.',
  'warzone.elimination_count': 'React to {player} reaching {elimination_count} eliminations.',
  'warzone.players_remaining': 'Comment on {players_remaining} players remaining.',

  // Arc Raiders
  'arc_raiders.game_start': 'React to the raid starting.',
  'arc_raiders.game_end': 'React to the raid ending.',
  'arc_raiders.victory': "Celebrate {player}'s victory!",
  'arc_raiders.defeat': "React to {player}'s defeat.",
  'arc_raiders.player_knocked': 'React to {player} going down.',
  'arc_raiders.player_eliminated': 'React to {player} being eliminated.',
  'arc_raiders.enemy_spotted': 'React to an enemy being spotted.',
  'arc_raiders.enemy_detected': 'React to an enemy detected nearby.',
  'arc_raiders.interesting_moment': 'React to an interesting moment.',

  // Call of Duty: Black Ops 6
  'black_ops_6.elimination': 'React to an enemy being eliminated.',
  'black_ops_6.victory': "Celebrate {player}'s victory!",
  'black_ops_6.defeat': "React to {player}'s defeat.",
  'black_ops_6.spectating': 'React to {player} now spectating.',

  // Rocket League
  'rocket_league.game_start': 'React to the match starting.',
  'rocket_league.game_end': 'React to the match ending.',
  'rocket_league.team_scored': "React to {player}'s team scoring a goal.",
  'rocket_league.opponent_scored': 'React to the opponent scoring.',
  'rocket_league.victory': "Celebrate {player}'s Rocket League win!",
  'rocket_league.defeat': "React to {player}'s Rocket League loss.",

  // Minecraft
  'minecraft.ender_dragon_spawned': 'React to the Ender Dragon spawning.',
  'minecraft.boss_killed': 'Celebrate {player} defeating the boss!',
  'minecraft.wither_spawned': 'React to {player} summoning the Wither.',
  'minecraft.advancement_made': 'React to {player} earning an advancement.',
  'minecraft.first_diamond': 'Celebrate {player} finding diamonds!',
  'minecraft.nether_entered': 'React to {player} entering the Nether.',
  'minecraft.player_eliminated': 'React to {player} dying in Minecraft.',
  'minecraft.low_health': "Panic about {player}'s low health.",
  'minecraft.totem_of_undying_used': 'React to {player} using a Totem of Undying.',

  // Apex Legends
  'apex_legends.game_start': 'React to the match starting.',
  'apex_legends.deploy': 'React to {player} jumping from the dropship.',
  'apex_legends.storm_shrinking': 'Warn about the ring closing.',
  'apex_legends.game_end': 'React to the match ending.',
  'apex_legends.player_knocked': 'React to {player} getting knocked.',
  'apex_legends.player_revived': 'React to {player} being revived.',
  'apex_legends.player_eliminated': 'React to {player} being eliminated.',
  'apex_legends.victory': "Celebrate {player}'s squad being Champion!",
  'apex_legends.defeat': "React to {player}'s squad being eliminated.",
  'apex_legends.elimination': 'React to an enemy being eliminated.',
  'apex_legends.knockout': 'React to {player} knocking an enemy.',

  // Battlefield 6
  'battlefield_6.game_start': 'React to the battle starting.',
  'battlefield_6.game_end': 'React to the match ending.',
  'battlefield_6.victory': "Celebrate {player}'s team winning!",
  'battlefield_6.defeat': "React to {player}'s team losing.",
  'battlefield_6.elimination': 'React to an enemy being eliminated.',
  'battlefield_6.player_eliminated': 'React to {player} going down.',

  // Dead by Daylight
  'dead_by_daylight.game_start': 'React to the trial beginning.',
  'dead_by_daylight.game_end': 'React to the trial ending.',
  'dead_by_daylight.victory': 'React to the match ending in victory.',
  'dead_by_daylight.player_eliminated': 'React to {player} being sacrificed.',
  'dead_by_daylight.elimination': 'React to a survivor being sacrificed.',
  'dead_by_daylight.hooked_survivor': 'React to a survivor being hooked.',
  'dead_by_daylight.escaped': 'React to a survivor escaping.',

  // Deadlock
  'deadlock.game_start': 'React to the match starting.',
  'deadlock.game_end': 'React to the match ending.',
  'deadlock.victory': "Celebrate {player}'s team winning!",
  'deadlock.defeat': "React to {player}'s team losing.",
  'deadlock.elimination': 'React to an enemy hero being eliminated.',
  'deadlock.player_eliminated': 'React to {player} being eliminated.',

  // Dota 2
  'dota_2.game_start': 'React to the match starting.',
  'dota_2.game_end': 'React to the match ending.',
  'dota_2.victory': "Celebrate {player}'s team destroying the Ancient!",
  'dota_2.defeat': "React to {player}'s team losing.",
  'dota_2.elimination': 'React to a hero kill.',
  'dota_2.player_eliminated': "React to {player}'s hero dying.",
  'dota_2.tower_destroyed': 'React to a tower being destroyed.',
  'dota_2.glyph_used': 'React to the Glyph being activated.',

  // League of Legends
  'league_of_legends.game_start': 'React to minions spawning and the match starting.',
  'league_of_legends.game_end': 'React to the match ending.',
  'league_of_legends.victory': "Celebrate {player}'s team destroying the Nexus!",
  'league_of_legends.defeat': "React to {player}'s team losing.",
  'league_of_legends.elimination': 'React to {player} getting a kill.',
  'league_of_legends.player_eliminated': "React to {player}'s champion dying.",
  'league_of_legends.objective_ally': "React to {player}'s team securing an objective.",
  'league_of_legends.objective_enemy': 'React to the enemy stealing an objective.',
  'league_of_legends.enemy_turret_destroyed': 'React to an enemy turret falling.',
  'league_of_legends.ally_turret_destroyed': 'React to an ally turret being lost.',

  // Marvel Rivals
  'marvel_rivals.game_end': 'React to the match ending.',
  'marvel_rivals.victory': "Celebrate {player}'s team winning!",
  'marvel_rivals.defeat': "React to {player}'s team losing.",
  'marvel_rivals.elimination': 'React to a hero being eliminated.',
  'marvel_rivals.player_eliminated': "React to {player}'s hero being eliminated.",

  // Overwatch 2
  'overwatch_2.round_start': 'React to the round starting.',
  'overwatch_2.round_end': 'React to the round ending.',
  'overwatch_2.victory': "Celebrate {player}'s team winning!",
  'overwatch_2.defeat': "React to {player}'s team losing.",
  'overwatch_2.elimination': 'React to an enemy being eliminated.',
  'overwatch_2.player_eliminated': 'React to {player} being eliminated.',

  // Rainbow Six Siege
  'rainbow_six_siege.round_start': 'React to the preparation phase starting.',
  'rainbow_six_siege.action_phase': 'React to the action phase beginning.',
  'rainbow_six_siege.round_end': 'React to the round ending.',
  'rainbow_six_siege.victory': "React to {player}'s team winning the round.",
  'rainbow_six_siege.defeat': "React to {player}'s team losing the round.",
  'rainbow_six_siege.elimination': 'React to an enemy operator being eliminated.',
  'rainbow_six_siege.player_eliminated': 'React to {player} being eliminated.',

  // War Thunder
  'war_thunder.elimination': 'React to {player} destroying an enemy.',

  // Marathon
  'marathon.game_start': 'React to the extraction mission starting.',
  'marathon.game_end': 'React to the match ending.',
  'marathon.victory': 'Celebrate {player} successfully exfiltrating!',
  'marathon.defeat': 'React to {player} being eliminated before extraction.',
  'marathon.player_knocked': 'React to {player} going down.',
  'marathon.player_eliminated': 'React to {player} being eliminated.',
  'marathon.elimination': 'React to an enemy runner being eliminated.',
  'marathon.knockout': 'React to a runner being knocked down.',

  // F1 25
  'f1_25.game_start': 'React to the race starting.',
  'f1_25.game_end': 'React to {player} crossing the chequered flag.',
  'f1_25.victory': 'Celebrate {player} winning the race in P1!',
  'f1_25.position_change': "React to {player}'s position changing on track.",
  'f1_25.lap_change': 'React to {player} starting a new lap.',

  // EA Sports FC 26
  'ea_sports_fc_26.game_start': 'React to the match kicking off.',
  'ea_sports_fc_26.game_end': 'React to the final whistle.',
  'ea_sports_fc_26.goal': 'React to a goal being scored!',
  'ea_sports_fc_26.set_piece': 'React to a set piece opportunity.',
  'ea_sports_fc_26.halftime': 'React to halftime.',
  'ea_sports_fc_26.fulltime': 'React to the full time whistle.',

  // NBA 2K26
  'nba_2k26.game_start': 'React to the game tipping off.',
  'nba_2k26.game_end': 'React to the final buzzer.',
  'nba_2k26.goal': 'React to a basket being scored!',
  'nba_2k26.halftime': 'React to halftime.',

  // Forza Horizon 6
  'forza_horizon_6.game_start': 'React to the race starting.',
  'forza_horizon_6.game_end': 'React to {player} finishing the race.',
  'forza_horizon_6.position_change': "React to {player}'s race position changing.",
  'forza_horizon_6.lap_change': 'React to {player} starting a new lap.',
  'forza_horizon_6.great_drift': 'React to {player} pulling off an epic drift.',
  'forza_horizon_6.great_air': 'React to {player} catching massive air.',
  'forza_horizon_6.great_skill_chain': 'React to {player} landing a great skill chain.',

  // Enshrouded
  'enshrouded.player_eliminated': 'React to {player} being eliminated in Enshrouded.',
  'enshrouded.level_up': 'Celebrate {player} leveling up!',
  'enshrouded.soul_discovered': 'React to {player} discovering a soul.',
  'enshrouded.quest_update': "React to {player}'s quest being updated.",
} as const;

export type InstructionType = keyof typeof perGameInstructions;
export type TInstruction = InstructionType;

export const Instructions = Object.fromEntries(
  Object.entries(perGameInstructions).map(([type, prompt]) => [type, withWordLimit(prompt)]),
) as Record<InstructionType, string>;
