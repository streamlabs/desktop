/**
 * Acquires and drives `fakegame.exe` from summeroff/game-capture-target — a renameable Win32
 * capture target used to exercise Game Capture without owning the games it impersonates.
 *
 * The binary is fetched from a pinned release and checksum-verified into the gitignored
 * `test-dist/`; set FAKEGAME_PATH to use a local build instead (offline, or when testing a
 * change to the tool itself).
 *
 * The target reports itself over NDJSON on stdout (`--events json`): a `ready` object, whether
 * an armed capture block verified, and whether OBS actually hooked it.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as ChildProcess from 'child_process';
import fetch from 'node-fetch';
import extract = require('extract-zip');

const RELEASE_TAG = 'v0.3.0';
const ZIP_NAME = `fakegame-${RELEASE_TAG}-win-x64.zip`;
const ZIP_URL = `https://github.com/summeroff/game-capture-target/releases/download/${RELEASE_TAG}/${ZIP_NAME}`;
const ZIP_SHA256 = 'de4b23dd02515d3d388bbede7689ecadf2378ca4f22bf9bbdd05c27d354a9448';

// __dirname is test-dist/test/helpers at runtime
const CACHE_DIR = path.resolve(__dirname, '..', '..', 'game-capture-target');
const SPAWN_DIR = path.join(CACHE_DIR, '_spawn');
const EXTRACT_DIR = path.join(CACHE_DIR, RELEASE_TAG);

const READY_TIMEOUT = 30000;

export interface IGameCaptureProfile {
  id: string;
  displayName: string;
  exe: string;
  windowClass: string;
  windowTitle: string;
  clientWidth: number;
  clientHeight: number;
  severityName: 'Normal' | 'Warning' | 'Error';
  captureExpected: boolean;
  defaultBlock: string;
  notes: string;
}

export interface ITargetEvent {
  event: string;
  ts: string;
  [key: string]: any;
}

export interface ILaunchedTarget {
  profile: string;
  pid: number;
  hwnd: string;
  exe: string;
  windowClass: string;
  windowTitle: string;
  clientWidth: number;
  clientHeight: number;
  blockCapture: string;
  captureExpected: boolean;
  /** value for the `window` property of a game/window capture source, computed by the target */
  obsWindowSetting: string;
  /** "1280x720" — what the source reports once real frames arrive */
  clientSize: string;
  /** every event seen so far */
  events: ITargetEvent[];
  /** resolves with the first matching event, or null on timeout */
  waitForEvent(name: string, timeoutMs?: number): Promise<ITargetEvent>;
}

interface ITargetState {
  child: ChildProcess.ChildProcess;
  events: ITargetEvent[];
  waiters: { name: string; resolve: (e: ITargetEvent) => void }[];
}

const running: ITargetState[] = [];

/**
 * `title:class:exe` with `#` and `:` escaped the way libobs expects (see encode_dstr in
 * libobs/util/windows/window-helpers.c — `#` must be escaped first). Only needed for synthetic
 * settings that never launch a target; a launched one reports its own `obsWindowSetting`.
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

/** Resolves fakegame.exe, downloading the pinned release if it is not already cached. */
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
 * compatibility entries apply), launches it and waits for its `ready` event.
 */
export async function launchProfile(
  id: string,
  opts: { api?: string; blockCapture?: string; instance?: string; extraArgs?: string[] } = {},
): Promise<ILaunchedTarget> {
  const source = await ensureBinary();
  const profile = await getProfile(id);

  const dir = path.join(SPAWN_DIR, opts.instance ? `${id}-${opts.instance}` : id);
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, profile.exe);
  fs.copyFileSync(source, target);

  const args = ['--events', 'json', '--profile', id];
  if (opts.api) args.push('--api', opts.api);
  if (opts.blockCapture) args.push('--block-capture', opts.blockCapture);
  if (opts.instance) args.push('--instance', opts.instance);
  if (opts.extraArgs) args.push(...opts.extraArgs);

  const child = ChildProcess.spawn(target, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const state: ITargetState = { child, events: [], waiters: [] };
  running.push(state);

  const ready = await waitForReady(state, id, args);

  return {
    profile: ready.profile,
    pid: ready.pid,
    hwnd: ready.hwnd,
    exe: ready.exe,
    windowClass: ready.windowClass,
    windowTitle: ready.windowTitle,
    clientWidth: ready.clientWidth,
    clientHeight: ready.clientHeight,
    blockCapture: ready.blockCapture,
    captureExpected: ready.captureExpected,
    obsWindowSetting: ready.obsWindowSetting,
    clientSize: `${ready.clientWidth}x${ready.clientHeight}`,
    events: state.events,
    waitForEvent: (name: string, timeoutMs = 20000) => waitForEvent(state, name, timeoutMs),
  };
}

function waitForEvent(state: ITargetState, name: string, timeoutMs: number) {
  const seen = state.events.find(e => e.event === name);
  if (seen) return Promise.resolve(seen);

  return new Promise<ITargetEvent>(resolve => {
    const waiter = { name, resolve };
    state.waiters.push(waiter);
    setTimeout(() => {
      state.waiters = state.waiters.filter(w => w !== waiter);
      resolve(null);
    }, timeoutMs);
  });
}

function waitForReady(state: ITargetState, id: string, args: string[]) {
  return new Promise<ITargetEvent>((resolve, reject) => {
    let pending = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(
        new Error(`game capture target "${id}" was not ready in ${READY_TIMEOUT}ms
args: ${args.join(' ')}
stderr: ${stderr}`),
      );
    }, READY_TIMEOUT);

    state.child.stdout.on('data', (d: Buffer) => {
      // NDJSON: consume whole lines, keep any partial tail for the next chunk
      const lines = (pending + d.toString()).split('\n');
      pending = lines.pop();

      for (const line of lines) {
        if (!line.trim()) continue;
        let parsed: ITargetEvent;
        try {
          parsed = JSON.parse(line);
        } catch (e: unknown) {
          continue; // not an event line
        }

        state.events.push(parsed);

        // e.g. exe_mismatch when the binary was not renamed, which silently stops the
        // compatibility entry from matching. Surface it rather than leaving it buffered.
        if (parsed.event === 'warning') {
          console.log(`[game-capture-target:${id}] ${parsed.code}: ${parsed.detail}`);
        }

        state.waiters
          .filter(w => w.name === parsed.event)
          .forEach(w => {
            state.waiters = state.waiters.filter(x => x !== w);
            w.resolve(parsed);
          });

        if (parsed.event === 'ready' && !settled) {
          settled = true;
          clearTimeout(timer);
          resolve(parsed);
        }
      }
    });

    state.child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    state.child.on('exit', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // exit codes: 2 args / 3 window / 4 renderer / 5 block could not be verified
      reject(
        new Error(`game capture target "${id}" exited early with code ${code}
args: ${args.join(' ')}
stderr: ${stderr}`),
      );
    });
  });
}

/** Terminates every target launched by this process. Safe to call more than once. */
export function stopAll() {
  while (running.length) {
    const state = running.pop();
    const child = state && state.child;
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
