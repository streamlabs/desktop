import { IGameConfig, EGame, EGameState } from './ai-highlighter.models';
import Utils from 'services/utils';

const titlePath = 'https://cdn.streamlabs.com/static/imgs/game-titles/';
const thumbnailPath = 'https://cdn.streamlabs.com/static/imgs/game-thumbnails/';
const heroPath = 'https://cdn.streamlabs.com/static/imgs/hero-images/';
const exampleVideoPath = 'https://slobs-cdn.streamlabs.com/media/example-videos/';

export const FORTNITE_CONFIG: IGameConfig = {
  name: EGame.FORTNITE,
  label: 'Fortnite',
  gameModes: 'Battle Royale, Zero Build, Reload, OG',
  titleIcon: `${titlePath}${EGame.FORTNITE}.svg`,
  thumbnail: `${thumbnailPath}${EGame.FORTNITE}.png`,
  state: EGameState.LIVE,
  importModalConfig: {
    backgroundColor: '#1C1D45',
    accentColor: '#DC8FF2',
    artwork: `${heroPath}${EGame.FORTNITE}.png`,
    horizontalExampleVideo: `${exampleVideoPath}${EGame.FORTNITE}-horizontal.mp4`,
    verticalExampleVideo: `${exampleVideoPath}${EGame.FORTNITE}-vertical.mp4`,
  },
};

const WARZONE_CONFIG: IGameConfig = {
  name: EGame.WARZONE,
  label: 'Call of Duty: Warzone',
  gameModes: '',
  titleIcon: `${titlePath}${EGame.WARZONE}.svg`,
  thumbnail: `${thumbnailPath}${EGame.WARZONE}.png`,
  state: EGameState.LIVE,
  importModalConfig: {
    accentColor: '#2BAC74',
    artwork: `${heroPath}${EGame.WARZONE}.png`,
    backgroundColor: '#0A311C',
    horizontalExampleVideo: `${exampleVideoPath}${EGame.WARZONE}-horizontal.mp4`,
    verticalExampleVideo: `${exampleVideoPath}${EGame.WARZONE}-vertical.mp4`,
  },
};

const BLACK_OPS_6_CONFIG: IGameConfig = {
  name: EGame.BLACK_OPS_6,
  label: 'Call of Duty: Black Ops 6',
  gameModes: '',
  titleIcon: 'unset',
  thumbnail: `${thumbnailPath}call-of-duty-black-ops-6.png`,
  state: EGameState.LIVE,
  importModalConfig: {
    accentColor: '#FEA41E',
    artwork: `${heroPath}${EGame.BLACK_OPS_6}.png`,
    backgroundColor: '#151B1A',
    horizontalExampleVideo: `${exampleVideoPath}${EGame.BLACK_OPS_6}-horizontal.mp4`,
    verticalExampleVideo: `${exampleVideoPath}${EGame.BLACK_OPS_6}-vertical.mp4`,
  },
};

const BLACK_OPS_7_CONFIG: IGameConfig = {
  // use the same config as black ops 6 for now since the games are identical
  name: EGame.BLACK_OPS_7,
  label: 'Call of Duty: Black Ops 7',
  gameModes: '',
  titleIcon: 'unset',
  thumbnail: `${thumbnailPath}${EGame.BLACK_OPS_7}.png`,
  state: EGameState.LIVE,
  importModalConfig: {
    accentColor: '#F96800',
    artwork: `${heroPath}${EGame.BLACK_OPS_7}.png`,
    backgroundColor: '#000000',
  },
};

const MARVEL_RIVALS_CONFIG: IGameConfig = {
  name: EGame.MARVEL_RIVALS,
  label: 'Marvel Rivals',
  gameModes: '',
  titleIcon: `${titlePath}${EGame.MARVEL_RIVALS}.svg`,
  thumbnail: `${thumbnailPath}marvel-rivals.png`,
  state: EGameState.LIVE,
  importModalConfig: {
    accentColor: '#42BBC1',
    artwork: `${heroPath}${EGame.MARVEL_RIVALS}.png`,
    backgroundColor: '#5258AD',
    horizontalExampleVideo: `${exampleVideoPath}${EGame.MARVEL_RIVALS}-horizontal.mp4`,
    verticalExampleVideo: `${exampleVideoPath}${EGame.MARVEL_RIVALS}-vertical.mp4`,
  },
};

const WAR_THUNDER_CONFIG: IGameConfig = {
  name: EGame.WAR_THUNDER,
  label: 'War Thunder',
  gameModes: '',
  titleIcon: 'unset',
  thumbnail: `${thumbnailPath}war-thunder.png`,
  state: EGameState.LIVE,
  importModalConfig: {
    accentColor: '#EC2D19',
    artwork: `${heroPath}${EGame.WAR_THUNDER}.png`,
    backgroundColor: '#A18474',
    horizontalExampleVideo: `${exampleVideoPath}${EGame.WAR_THUNDER}-horizontal.mp4`,
    verticalExampleVideo: `${exampleVideoPath}${EGame.WAR_THUNDER}-vertical.mp4`,
  },
};

const VALORANT_CONFIG: IGameConfig = {
  name: EGame.VALORANT,
  label: 'VALORANT',
  gameModes: '',
  titleIcon: `${titlePath}${EGame.VALORANT}.svg`,
  thumbnail: `${thumbnailPath}${EGame.VALORANT}.png`,
  state: EGameState.LIVE,
  importModalConfig: {
    accentColor: '#FF4655',
    artwork: `${heroPath}${EGame.VALORANT}.png`,
    backgroundColor: '#162029',
  },
};

const COUNTER_STRIKE_2_CONFIG: IGameConfig = {
  name: EGame.COUNTER_STRIKE_2,
  label: 'Counter-Strike',
  gameModes: '',
  titleIcon: `${titlePath}${EGame.COUNTER_STRIKE_2}.svg`,
  thumbnail: `${thumbnailPath}${EGame.COUNTER_STRIKE_2}.png`,
  state: EGameState.LIVE,
  importModalConfig: {
    accentColor: '#E38717',
    artwork: `${heroPath}${EGame.COUNTER_STRIKE_2}.png`,
    backgroundColor: '#BEBEBE',
  },
};

const APEX_LEGENDS_CONFIG: IGameConfig = {
  name: EGame.APEX_LEGENDS,
  label: 'Apex Legends',
  gameModes: '',
  titleIcon: `${titlePath}${EGame.APEX_LEGENDS}.svg`,
  thumbnail: `${thumbnailPath}${EGame.APEX_LEGENDS}.png`,
  state: EGameState.LIVE,
  importModalConfig: {
    accentColor: '#EBFF8A',
    artwork: `${heroPath}${EGame.APEX_LEGENDS}.png`,
    backgroundColor: '#C7D2CA',
  },
};

const PUBG_CONFIG: IGameConfig = {
  name: EGame.PUBG,
  label: 'PUBG: BATTLEGROUNDS',
  gameModes: '',
  titleIcon: `${titlePath}${EGame.PUBG}.svg`,
  thumbnail: `${thumbnailPath}${EGame.PUBG}.png`,
  state: EGameState.LIVE,
  importModalConfig: {
    accentColor: '#E38717',
    artwork: `${heroPath}${EGame.PUBG}.png`,
    backgroundColor: '#2D3953',
  },
};

const RAINBOW_SIX_SIEGE: IGameConfig = {
  name: EGame.RAINBOW_SIX_SIEGE,
  label: "Tom Clancy's Rainbow Six Siege X",
  gameModes: '',
  titleIcon: 'unset',
  thumbnail: `${thumbnailPath}${EGame.RAINBOW_SIX_SIEGE}.png`,
  state: EGameState.LIVE,
  importModalConfig: {
    accentColor: '#5F98F7',
    artwork: `${heroPath}${EGame.RAINBOW_SIX_SIEGE}.png`,
    backgroundColor: '#25262A',
  },
};

const OVERWATCH_2: IGameConfig = {
  name: EGame.OVERWATCH_2,
  label: 'Overwatch 2',
  gameModes: '',
  titleIcon: `${titlePath}${EGame.OVERWATCH_2}.svg`,
  thumbnail: `${thumbnailPath}${EGame.OVERWATCH_2}.png`,
  state: EGameState.LIVE,
  importModalConfig: {
    accentColor: '#E5803F',
    artwork: `${heroPath}${EGame.OVERWATCH_2}.png`,
    backgroundColor: '#cdc7cd',
  },
};

const LEAGUE_OF_LEGENDS: IGameConfig = {
  name: EGame.LEAGUE_OF_LEGENDS,
  label: 'League of Legends',
  gameModes: '',
  titleIcon: `${titlePath}${EGame.LEAGUE_OF_LEGENDS}.svg`,
  thumbnail: `${thumbnailPath}${EGame.LEAGUE_OF_LEGENDS}.png`,
  state: EGameState.LIVE,
  importModalConfig: {
    accentColor: '#9B9B9B',
    artwork: `${heroPath}${EGame.LEAGUE_OF_LEGENDS}.png`,
    backgroundColor: '#161D2B',
  },
};

const BATTLEFIELD_6: IGameConfig = {
  name: EGame.BATTLEFIELD_6,
  label: 'Battlefield 6',
  gameModes: '',
  titleIcon: `${titlePath}${EGame.BATTLEFIELD_6}.svg`,
  thumbnail: `${thumbnailPath}${EGame.BATTLEFIELD_6}.png`,
  state: EGameState.LIVE,
  importModalConfig: {
    accentColor: '#FF3C00',
    artwork: `${heroPath}${EGame.BATTLEFIELD_6}.png`,
    backgroundColor: '#32383D',
  },
};

const ARC_RAIDERS: IGameConfig = {
  name: EGame.ARC_RAIDERS,
  label: 'ARC Raiders',
  gameModes: '',
  titleIcon: 'unset',
  thumbnail: `${thumbnailPath}${EGame.ARC_RAIDERS}.png`,
  state: EGameState.LIVE,
  importModalConfig: {
    accentColor: '#D04122',
    artwork: `${heroPath}${EGame.ARC_RAIDERS}.png`,
    backgroundColor: '#190A40',
  },
};

const ROCKET_LEAGUE: IGameConfig = {
  name: EGame.ROCKET_LEAGUE,
  label: 'Rocket League',
  gameModes: '',
  titleIcon: 'unset',
  thumbnail: `${thumbnailPath}${EGame.ROCKET_LEAGUE}.png`,
  state: EGameState.LIVE,
  importModalConfig: {
    accentColor: '#5470EF',
    artwork: `${heroPath}${EGame.ROCKET_LEAGUE}.png`,
    backgroundColor: '#161D2B',
  },
};

const DOTA_2: IGameConfig = {
  name: EGame.DOTA_2,
  label: 'Dota 2',
  gameModes: '',
  titleIcon: 'unset',
  thumbnail: `${thumbnailPath}${EGame.DOTA_2}.png`,
  state: EGameState.LIVE,
  importModalConfig: {
    accentColor: '#FED047',
    artwork: `${heroPath}${EGame.DOTA_2}.png`,
    backgroundColor: '#D04122',
  },
};

const DEAD_BY_DAYLIGHT: IGameConfig = {
  name: EGame.DEAD_BY_DAYLIGHT,
  label: 'Dead by Daylight',
  gameModes: '',
  titleIcon: 'unset',
  thumbnail: `${thumbnailPath}${EGame.DEAD_BY_DAYLIGHT}.png`,
  state: EGameState.LIVE,
  importModalConfig: {
    accentColor: '#8088A9',
    artwork: `${heroPath}${EGame.DEAD_BY_DAYLIGHT}.png`,
    backgroundColor: '#172D3B',
  },
};

const MARATHON: IGameConfig = {
  name: EGame.MARATHON,
  label: 'Marathon',
  gameModes: '',
  titleIcon: 'unset',
  thumbnail: `${thumbnailPath}${EGame.MARATHON}.png`,
  state: EGameState.LIVE,
  importModalConfig: {
    accentColor: '#cffb54',
    artwork: `${heroPath}${EGame.MARATHON}.png`,
    backgroundColor: '#000000',
  },
};

const F1_25: IGameConfig = {
  name: EGame.F1_25,
  label: 'F1® 25',
  gameModes: '',
  titleIcon: 'unset',
  thumbnail: `${thumbnailPath}${EGame.F1_25}.png`,
  state: EGameState.LIVE,
  importModalConfig: {
    accentColor: '#d35459',
    artwork: `${heroPath}${EGame.F1_25}.png`,
    backgroundColor: '#151616',
  },
};

const EA_SPORTS_FC_26: IGameConfig = {
  name: EGame.EA_SPORTS_FC_26,
  label: 'EA Sports FC™ 26',
  gameModes: '',
  titleIcon: 'unset',
  thumbnail: `${thumbnailPath}${EGame.EA_SPORTS_FC_26}.png`,
  state: EGameState.LIVE,
  importModalConfig: {
    accentColor: '#81f07b',
    artwork: `${heroPath}${EGame.EA_SPORTS_FC_26}.png`,
    backgroundColor: '#151616',
  },
};

const NBA_2K26: IGameConfig = {
  name: EGame.NBA_2K26,
  label: 'NBA 2K26',
  gameModes: '',
  titleIcon: 'unset',
  thumbnail: `${thumbnailPath}${EGame.NBA_2K26}.png`,
  state: EGameState.LIVE,
  importModalConfig: {
    accentColor: '#fa0000',
    artwork: `${heroPath}${EGame.NBA_2K26}.png`,
    backgroundColor: '#111111',
  },
};

const DEADLOCK: IGameConfig = {
  name: EGame.DEADLOCK,
  label: 'Deadlock',
  gameModes: '',
  titleIcon: 'unset',
  thumbnail: `${thumbnailPath}${EGame.DEADLOCK}.png`,
  state: EGameState.LIVE,
  importModalConfig: {
    accentColor: '#c26239',
    artwork: `${heroPath}${EGame.DEADLOCK}.png`,
    backgroundColor: '#131313',
  },
};

const FORZA_HORIZON_6: IGameConfig = {
  name: EGame.FORZA_HORIZON_6,
  label: 'Forza Horizon 6',
  gameModes: '',
  titleIcon: 'unset',
  thumbnail: `${thumbnailPath}${EGame.FORZA_HORIZON_6}.png`,
  state: EGameState.LIVE,
  importModalConfig: {
    accentColor: '#7B2CBF',
    artwork: `${heroPath}${EGame.FORZA_HORIZON_6}.png`,
    backgroundColor: '#151616',
  },
};

const ENSHROUDED: IGameConfig = {
  name: EGame.ENSHROUDED,
  label: 'Enshrouded',
  gameModes: '',
  titleIcon: 'unset',
  thumbnail: `${thumbnailPath}${EGame.ENSHROUDED}.png`,
  state: EGameState.LIVE,
  importModalConfig: {
    accentColor: '#A55A2A',
    artwork: `${heroPath}${EGame.ENSHROUDED}.png`,
    backgroundColor: '#1A1410',
  },
};

const MINECRAFT: IGameConfig = {
  name: EGame.MINECRAFT,
  label: 'Minecraft',
  gameModes: '',
  titleIcon: 'unset',
  thumbnail: `${thumbnailPath}${EGame.MINECRAFT}.png`,
  state: EGameState.LIVE,
  importModalConfig: {
    accentColor: '#5BA84A',
    artwork: `${heroPath}${EGame.MINECRAFT}.png`,
    backgroundColor: '#1D1A17',
  },
};

const UNSET_CONFIG: IGameConfig = {
  name: EGame.UNSET,
  label: 'unset',
  gameModes: 'unset',
  titleIcon: 'unset',
  thumbnail: 'unset',
  state: EGameState.INTERNAL,
  importModalConfig: undefined,
};

// Each game must have a config like and the config must be added here.
const GAME_CONFIGS: Record<EGame, IGameConfig> = {
  [EGame.FORTNITE]: FORTNITE_CONFIG, // ✅
  [EGame.WARZONE]: WARZONE_CONFIG, // ✅
  [EGame.BLACK_OPS_6]: BLACK_OPS_6_CONFIG, // ✅
  [EGame.BLACK_OPS_7]: BLACK_OPS_7_CONFIG,
  [EGame.MARVEL_RIVALS]: MARVEL_RIVALS_CONFIG, // ✅
  [EGame.WAR_THUNDER]: WAR_THUNDER_CONFIG, // ✅
  [EGame.VALORANT]: VALORANT_CONFIG, // ✅
  [EGame.COUNTER_STRIKE_2]: COUNTER_STRIKE_2_CONFIG,
  [EGame.APEX_LEGENDS]: APEX_LEGENDS_CONFIG, // ✅
  [EGame.PUBG]: PUBG_CONFIG, // ✅
  [EGame.RAINBOW_SIX_SIEGE]: RAINBOW_SIX_SIEGE, // ✅
  [EGame.OVERWATCH_2]: OVERWATCH_2,
  [EGame.LEAGUE_OF_LEGENDS]: LEAGUE_OF_LEGENDS, // ✅
  [EGame.BATTLEFIELD_6]: BATTLEFIELD_6, // ✅
  [EGame.ARC_RAIDERS]: ARC_RAIDERS,
  [EGame.ROCKET_LEAGUE]: ROCKET_LEAGUE,
  [EGame.DOTA_2]: DOTA_2,
  [EGame.DEAD_BY_DAYLIGHT]: DEAD_BY_DAYLIGHT,
  [EGame.MARATHON]: MARATHON,
  [EGame.F1_25]: F1_25,
  [EGame.EA_SPORTS_FC_26]: EA_SPORTS_FC_26,
  [EGame.NBA_2K26]: NBA_2K26,
  [EGame.DEADLOCK]: DEADLOCK,
  [EGame.FORZA_HORIZON_6]: FORZA_HORIZON_6,
  [EGame.ENSHROUDED]: ENSHROUDED,
  [EGame.MINECRAFT]: MINECRAFT,
  [EGame.UNSET]: UNSET_CONFIG,
};

export const supportedGames = Object.entries(GAME_CONFIGS)
  .filter(([gameKey]) => gameKey !== EGame.UNSET)
  .filter(([_, gameConfig]) => {
    if (Utils.getHighlighterEnvironment() === 'production') {
      return gameConfig.state !== EGameState.INTERNAL;
    } else {
      return true;
    }
  })
  .map(([gameKey, gameConfig]) => {
    return {
      value: gameKey as EGame,
      label: gameConfig.label,
      description: gameConfig.gameModes,
      image: gameConfig.thumbnail,
    };
  });

export function getConfigByGame(game: EGame): IGameConfig;
export function getConfigByGame(game?: EGame): IGameConfig | undefined;
export function getConfigByGame(game: EGame | undefined): IGameConfig | undefined {
  if (!game) {
    return undefined;
  }
  const lowercaseGame = game.toLowerCase() as EGame;
  return GAME_CONFIGS[lowercaseGame] || UNSET_CONFIG;
}
/**
 * Games supported by Streamlabs Replay, keyed by game id.
 * Snapshot of `configs/games.json` on the highlighter CDN. Used as long as the
 * fresh list hasn't been fetched (or the fetch failed). See HighlighterService.fetchReplaySupportedGames
 */
export const FALLBACK_REPLAY_SUPPORTED_GAMES: Dictionary<string> = {
  '7_days_to_die': '7 Days to Die',
  apex_legends: 'Apex Legends',
  arena_breakout_infinite: 'Arena Breakout: Infinite',
  arc_raiders: 'ARC Raiders',
  battlefield_6: 'Battlefield 6',
  bloodborne: 'Bloodborne',
  black_ops_6: 'Call of Duty: Black Ops 6',
  black_ops_7: 'Call of Duty: Black Ops 7',
  modern_warfare_4: 'Call of Duty: Modern Warfare 4',
  warzone: 'Call of Duty: Warzone',
  counter_strike_2: 'Counter-Strike 2',
  dark_souls_2: 'Dark Souls II',
  dark_souls_3: 'Dark Souls III',
  dark_souls_remastered: 'Dark Souls Remastered',
  dayz: 'DayZ',
  dead_by_daylight: 'Dead by Daylight',
  deadlock: 'Deadlock',
  delta_force: 'Delta Force',
  dota_2: 'Dota 2',
  ea_sports_fc_26: 'EA Sports FC™ 26',
  elden_ring: 'ELDEN RING',
  enshrouded: 'Enshrouded',
  escape_from_tarkov: 'Escape from Tarkov',
  f1_25: 'F1® 25',
  fortnite: 'Fortnite',
  forza_horizon_6: 'Forza Horizon 6',
  halo_infinite: 'Halo Infinite',
  helldivers_2: 'Helldivers 2',
  heroes_of_the_storm: 'Heroes of the Storm',
  hunt_showdown_1896: 'Hunt: Showdown 1896',
  league_of_legends: 'League of Legends',
  left_4_dead_2: 'Left 4 Dead 2',
  madden_nfl_27: 'Madden NFL 27',
  marathon: 'Marathon',
  marvel_rivals: 'Marvel Rivals',
  minecraft: 'Minecraft',
  mortal_shell_2: 'Mortal Shell II',
  nba_2k26: 'NBA 2K26',
  nba_2k27: 'NBA 2K27',
  overwatch_2: 'Overwatch 2',
  palworld: 'Palworld',
  path_of_exile_2: 'Path of Exile 2',
  pubg: 'PUBG: BATTLEGROUNDS',
  rainbow_six_siege: "Tom Clancy's Rainbow Six Siege",
  rocket_league: 'Rocket League',
  rust: 'Rust',
  sekiro_shadows_die_twice: 'Sekiro: Shadows Die Twice',
  teamfight_tactics: 'Teamfight Tactics',
  valheim: 'Valheim',
  valorant: 'VALORANT',
  wardogs: 'WARDOGS',
  war_thunder: 'War Thunder',
  world_of_warcraft_ss: 'World of Warcraft (Solo Shuffle)',
  just_chatting: 'Just Chatting',
  other_game: 'Other Game',
};

/**
 * Replay game ids that don't enable the AI Highlighter in the go live flow.
 * Remove `just_chatting` from this list to enable it for the Just Chatting category.
 */
export const DISABLED_REPLAY_GAMES: string[] = ['just_chatting', 'other_game'];

const STREAM_HIGHLIGHTS_ONLY_SUFFIX = ' (Stream Highlights Only)';

/**
 * Replay labels non-gameplay entries like "Just Chatting (Stream Highlights Only)".
 * Strip that suffix so the label matches the platform category name.
 */
export function toPlatformCategoryLabel(replayLabel: string) {
  return replayLabel.endsWith(STREAM_HIGHLIGHTS_ONLY_SUFFIX)
    ? replayLabel.slice(0, -STREAM_HIGHLIGHTS_ONLY_SUFFIX.length)
    : replayLabel;
}

/**
 * Returns the game id if the given game (platform category name) is supported, otherwise false.
 * Checks the local game configs first, then the games supported by Replay.
 * Ids that only exist in Replay's list aren't part of EGame; getConfigByGame falls back to UNSET for them.
 */
export function isGameSupported(
  game: string | undefined,
  replaySupportedGames: Dictionary<string> = FALLBACK_REPLAY_SUPPORTED_GAMES,
): EGame | false {
  if (!game) {
    return false;
  }
  const lowercaseGame = game.toLowerCase();

  const localGameValue = supportedGames.find(
    supportedGame => supportedGame.label.toLowerCase() === lowercaseGame,
  )?.value;
  if (localGameValue) {
    return localGameValue;
  }

  const replayGameId = Object.keys(replaySupportedGames).find(
    id =>
      !DISABLED_REPLAY_GAMES.includes(id) &&
      replaySupportedGames[id]?.toLowerCase() === lowercaseGame,
  );
  if (replayGameId) {
    return replayGameId as EGame;
  }
  return false;
}
