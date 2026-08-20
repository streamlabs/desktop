import path from 'path';
import Utils from 'services/utils';
import { getOS, OS } from 'util/operating-systems';
import * as remote from '@electron/remote';

export const FFMPEG_DIR = Utils.isDevMode()
  ? path.resolve('node_modules', 'obs-studio-node')
  : path.resolve(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'obs-studio-node');

export const FFMPEG_EXE = path.join(
  FFMPEG_DIR,
  getOS() === OS.Mac ? path.join('Frameworks', 'ffmpeg') : 'ffmpeg.exe',
);
export const FFPROBE_EXE = path.join(
  FFMPEG_DIR,
  getOS() === OS.Mac ? path.join('Frameworks', 'ffprobe') : 'ffprobe.exe',
);

export const SCRUB_WIDTH = 320;
export const SCRUB_WIDTH_VERTICAL = 100;
export const SCRUB_HEIGHT = 180;
export const SCRUB_FRAMES = 20;
export const SCRUB_SPRITE_DIRECTORY = path.join(remote.app.getPath('userData'), 'highlighter');

export const FADE_OUT_DURATION = 1;

export const SUPPORTED_FILE_TYPES = ['mp4', 'mov', 'mkv'];

export const AI_HIGHLIGHTER_BUILDS_URL_STAGING =
  'https://cdn-highlighter-builds.streamlabs.com/staging/manifest_win_x86_64.json';

export const AI_HIGHLIGHTER_BUILDS_URL_PRODUCTION =
  'https://cdn-highlighter-builds.streamlabs.com/production/manifest_win_x86_64.json';

export const HIGHLIGHTER_SETUP_URL_STAGING =
  'https://cdn-highlighter-desktop.streamlabs.com/streamlabs-highlighter/staging/win32/x64/Streamlabs%20Highlighter-Setup.exe';

export const HIGHLIGHTER_SETUP_URL_PRODUCTION =
  'https://cdn-highlighter-desktop.streamlabs.com/streamlabs-highlighter/production/win32/x64/Streamlabs%20Highlighter-Setup.exe';

export const REPLAY_PROTOCOL = 'streamlabs-highlighter';
export const REPLAY_APP_NAME = 'Streamlabs Highlighter';
export const REPLAY_SETUP_EXE_NAME = 'Streamlabs Highlighter-Setup.exe';

// Origin slug Replay attributes an install to when Streamlabs Desktop installed it.
export const REPLAY_INSTALL_ORIGIN = 'sl_desktop';

// The install origin marker is a hand-off file, so it lives in the current user's temp directory
// (%TEMP%\Streamlabs\install-origin.json) rather than in either app's data directory. It has to
// work before Replay is installed at all, and Replay deletes it as soon as it has been read.
// Deliberately not derived from REPLAY_APP_NAME: this directory name is a contract with Replay and
// does not follow the app rename.
export const REPLAY_INSTALL_ORIGIN_DIR_NAME = 'Streamlabs';
export const REPLAY_INSTALL_ORIGIN_FILE_NAME = 'install-origin.json';
