/**
 * Acquires and drives `fakegame.exe` from summeroff/game-capture-target — a renameable Win32
 * capture target used to exercise Game Capture without owning the games it impersonates.
 *
 * The binary is fetched from a pinned release and checksum-verified into the gitignored
 * `test-dist/`; set FAKEGAME_PATH to use a local build instead (offline, or when testing a
 * change to the tool itself).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as ChildProcess from 'child_process';
import fetch from 'node-fetch';
import extract = require('extract-zip');

const RELEASE_TAG = 'v0.1.0';
const ZIP_NAME = `fakegame-${RELEASE_TAG}-win-x64.zip`;
const ZIP_URL = `https://github.com/summeroff/game-capture-target/releases/download/${RELEASE_TAG}/${ZIP_NAME}`;
const ZIP_SHA256 = 'a247b693adf2327d3c86947759fc9be42477ac118af9b5e8ce3d1c7da06461d6';

// __dirname is test-dist/test/helpers at runtime
const CACHE_DIR = path.resolve(__dirname, '..', '..', 'game-capture-target');
const SPAWN_DIR = path.join(CACHE_DIR, '_spawn');
const EXTRACT_DIR = path.join(CACHE_DIR, RELEASE_TAG);

const WINDOW_READY_TIMEOUT = 30000;

export interface IGameCaptureProfile {
  id: string;
  displayName: string;
  exe: string;
  windowClass: string;
  windowTitle: string;
  severity: number;
  severityName: 'Normal' | 'Warning' | 'Error';
  captureExpected: boolean;
  defaultBlock: string;
  notes: string;
}

export interface ILaunchedTarget extends IGameCaptureProfile {
  pid: number;
  hwnd: string;
  /** value for the `window` property of a game/window capture source */
  obsWindowSetting: string;
  /**
   * Client area the target reports for itself, e.g. "1280x720". Game Capture renders a
   * placeholder at a different size when it is not capturing, so matching this exactly is the
   * only reliable way to tell real capture from the placeholder.
   */
  clientSize: string;
}

const running: ChildProcess.ChildProcess[] = [];

/**
 * `title:class:exe`, with `#` and `:` escaped the way libobs expects.
 * Mirrors encode_dstr/ms_build_window_strings in libobs/util/windows/window-helpers.c —
 * `#` must be escaped before `:` or the decode is ambiguous.
 */
export function buildWindowSetting(title: string, windowClass: string, exe: string) {
  const encode = (s: string) => s.replace(/#/g, '#22').replace(/:/g, '#3A');
  return `${encode(title)}:${encode(windowClass)}:${encode(exe)}`;
}

function sha256(file: string) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function download(url: string, dest: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
  fs.writeFileSync(dest, await res.buffer());
}

/**
 * Resolves fakegame.exe, downloading the pinned release if it is not already cached.
 */
export async function ensureBinary(): Promise<string> {
  const override = process.env.FAKEGAME_PATH;
  if (override) {
    if (!fs.existsSync(override)) {
      throw new Error(`FAKEGAME_PATH is set but does not exist: ${override}`);
    }
    return override;
  }

  const exePath = path.join(EXTRACT_DIR, 'fakegame.exe');
  if (fs.existsSync(exePath)) return exePath;

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const zipPath = path.join(CACHE_DIR, ZIP_NAME);

  if (!fs.existsSync(zipPath) || sha256(zipPath) !== ZIP_SHA256) {
    try {
      await download(ZIP_URL, zipPath);
    } catch (e: unknown) {
      throw new Error(
        `Could not download the game capture target from ${ZIP_URL}: ${e}\n` +
          'Set FAKEGAME_PATH to a local fakegame.exe to run offline.',
      );
    }
  }

  const actual = sha256(zipPath);
  if (actual !== ZIP_SHA256) {
    fs.unlinkSync(zipPath);
    throw new Error(`Checksum mismatch for ${ZIP_NAME}: expected ${ZIP_SHA256}, got ${actual}`);
  }

  await new Promise<void>((resolve, reject) => {
    extract(zipPath, { dir: EXTRACT_DIR }, err => (err ? reject(err) : resolve()));
  });

  // the zip has a single versioned folder; hoist the exe if it is nested
  if (!fs.existsSync(exePath)) {
    const nested = findExe(EXTRACT_DIR);
    if (!nested) throw new Error(`fakegame.exe not found after extracting ${ZIP_NAME}`);
    fs.copyFileSync(nested, exePath);
  }
  return exePath;
}

function findExe(dir: string): string {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const hit = findExe(full);
      if (hit) return hit;
    } else if (entry.name.toLowerCase() === 'fakegame.exe') {
      return full;
    }
  }
  return '';
}

export async function listProfiles(): Promise<IGameCaptureProfile[]> {
  const exe = await ensureBinary();
  const out = ChildProcess.execFileSync(exe, ['--list-profiles', '--json'], { encoding: 'utf8' });
  return JSON.parse(out);
}

export async function getProfile(id: string): Promise<IGameCaptureProfile> {
  const profile = (await listProfiles()).find(p => p.id === id);
  if (!profile) throw new Error(`unknown game capture profile: ${id}`);
  return profile;
}

/**
 * Copies the binary to the profile's executable name (the rename is what makes exe-matched
 * compatibility entries apply), launches it, and waits for its window to exist.
 */
export async function launchProfile(
  id: string,
  opts: { api?: string; blockCapture?: string; extraArgs?: string[] } = {},
): Promise<ILaunchedTarget> {
  const source = await ensureBinary();
  const profile = await getProfile(id);

  const dir = path.join(SPAWN_DIR, id);
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, profile.exe);
  fs.copyFileSync(source, target);

  const args = ['--profile', id];
  if (opts.api) args.push('--api', opts.api);
  if (opts.blockCapture) args.push('--block-capture', opts.blockCapture);
  if (opts.extraArgs) args.push(...opts.extraArgs);

  const child = ChildProcess.spawn(target, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  running.push(child);

  const { hwnd, clientSize } = await waitForWindow(child, id);

  return {
    ...profile,
    pid: child.pid,
    hwnd,
    clientSize,
    obsWindowSetting: buildWindowSetting(profile.windowTitle, profile.windowClass, profile.exe),
  };
}

function waitForWindow(child: ChildProcess.ChildProcess, id: string) {
  return new Promise<{ hwnd: string; clientSize: string }>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (fn: Function, arg: any) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(arg);
    };

    const timer = setTimeout(() => {
      finish(
        reject,
        new Error(`game capture target "${id}" did not open a window in ${WINDOW_READY_TIMEOUT}ms.
stdout: ${stdout}
stderr: ${stderr}`),
      );
    }, WINDOW_READY_TIMEOUT);

    child.stdout.on('data', (d: Buffer) => {
      stdout += d.toString();
      const m = stdout.match(/app: hwnd=([0-9A-Fa-f]+)/);
      // logged as e.g. "mode -> windowed client=1280x720", before the hwnd line
      const size = stdout.match(/client=(\d+x\d+)/);
      if (m) finish(resolve, { hwnd: m[1], clientSize: size ? size[1] : '' });
    });
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('exit', code =>
      finish(
        reject,
        new Error(`game capture target "${id}" exited early (code ${code}).
stdout: ${stdout}
stderr: ${stderr}`),
      ),
    );
  });
}

/** Terminates every target launched by this process. Safe to call more than once. */
export function stopAll() {
  while (running.length) {
    const child = running.pop();
    if (!child || child.killed || child.exitCode !== null) continue;
    try {
      // /T so any child processes go too; child.kill() alone is unreliable on Windows
      ChildProcess.execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
      });
    } catch (e: unknown) {
      // already gone
    }
  }
}
