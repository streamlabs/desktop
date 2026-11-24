/**
 * Connects an AI agent (Hermes) to Streamlabs with one click, for people who don't use a
 * command line: Settings > AI Agents > Connect Hermes.
 *
 * Streamlabs already runs the MCP server (app/util/mcp-launcher.js, http://127.0.0.1:28195/mcp).
 * This sets up Hermes to use it, without touching the user's own Hermes profiles:
 *
 *   1. A "streamlabs" Hermes profile, cloned from their active profile (Hermes' own
 *      `profile create --clone`), so it keeps their model, provider and logins.
 *   2. Our settings applied to that profile's config in one write: the Streamlabs and NVIDIA
 *      Broadcast MCP servers (NVIDIA's port read from this machine), toolsets, the skill
 *      loaded on start, and a few agent features turned off that get in the way of a demo.
 *   3. The Streamlabs skill and the stream-health watcher installed where Hermes finds them.
 *   4. Only if the user ticks the box: the profile made the one Hermes opens.
 *   5. Hermes' background service restarted, so the profile connects with these settings.
 *
 * Running it again updates the profile in place (their model and chats stay).
 */

import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import * as remote from '@electron/remote';
import { Service } from 'services/core/service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const yaml: { safeLoad(s: string): any; safeDump(o: any, opts?: any): string } = require('js-yaml');

export const AGENT_PROFILE = 'streamlabs';
export const MCP_PORT = Number(process.env.SLOBS_MCP_PORT) || 28195;
export const MCP_URL = `http://127.0.0.1:${MCP_PORT}/mcp`;
const NVIDIA_TOOLS = ['set_effects', 'get_broadcast_state', 'list_devices'];

export interface IConnectStep {
  label: string;
  ok: boolean;
  detail?: string;
}

export interface IAgentStatus {
  mcpUrl: string;
  mcpRunning: boolean;
  hermesFound: boolean;
  nvidiaPort: number | null;
  profileExists: boolean;
}

export interface IConnectResult {
  ok: boolean;
  steps: IConnectStep[];
  next?: string;
}

function hermesHome(): string {
  return path.join(
    process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'),
    'hermes',
  );
}

function hermesExe(): string {
  return path.join(hermesHome(), 'bin', 'hermes.exe');
}

function profileDir(name: string): string {
  return path.join(hermesHome(), 'profiles', name);
}

/** NVIDIA Broadcast publishes its MCP gateway port as base64 JSON in its app data. */
function nvidiaPort(): number | null {
  try {
    const file = path.join(os.homedir(), 'AppData', 'Roaming', 'nvidia-broadcast', 'gateway.json');
    const raw = fs.readFileSync(file, 'utf8').trim();
    return Number(JSON.parse(Buffer.from(raw, 'base64').toString('utf8')).port) || null;
  } catch {
    return null;
  }
}

function mcpRunning(): Promise<boolean> {
  return new Promise(resolve => {
    const req = http.get(`http://127.0.0.1:${MCP_PORT}/health`, { timeout: 2000 }, res => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

/** Run the Hermes CLI. Resolves with its output; rejects with a readable message. */
function hermes(args: string[], timeoutMs = 120000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      hermesExe(),
      args,
      {
        timeout: timeoutMs,
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', NO_COLOR: '1' },
      },
      (err, stdout, stderr) => {
        const out = `${stdout ?? ''}${stderr ?? ''}`.trim();
        if (err) reject(new Error(out.split('\n').slice(-3).join(' ') || err.message));
        else resolve(out);
      },
    );
  });
}

/** Where the files we install into Hermes come from: the repo in dev, next to the app when installed. */
function assetPath(file: 'SKILL.md' | 'stream-watch' | 'stream_health_monitor.py'): string {
  if (remote.app.isPackaged) {
    return path.join(path.dirname(process.execPath), 'mcp', 'hermes', file);
  }
  const repo = remote.app.getAppPath();
  return file === 'SKILL.md'
    ? path.join(repo, 'mcp', 'skill-demo', 'SKILL.md')
    : path.join(repo, 'mcp', 'scripts', 'hermes', file);
}

/** Set obj[a][b][c] = value, creating objects on the way. */
function setPath(obj: any, keys: string[], value: unknown): void {
  let o = obj;
  for (const k of keys.slice(0, -1)) {
    if (!o[k] || typeof o[k] !== 'object') o[k] = {};
    o = o[k];
  }
  o[keys[keys.length - 1]] = value;
}

/**
 * Stop Hermes' gateway process so it starts fresh (the Hermes desktop app restarts it right
 * away, or on its next launch) and every profile reconnects from its current settings.
 * Returns how many gateway processes were stopped.
 */
function restartHermesGateway(): Promise<number> {
  const query =
    'Get-CimInstance Win32_Process -Filter "Name=\'python.exe\'" | ' +
    "Where-Object { $_.CommandLine -like '*hermes_cli.main*gateway run*' } | " +
    'ForEach-Object { $_.ProcessId }';
  return new Promise((resolve, reject) => {
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', query],
      { timeout: 30000, windowsHide: true },
      (err, stdout) => {
        if (err) return reject(new Error('Could not look for the Hermes background service'));
        const pids = stdout
          .split(/\s+/)
          .map(Number)
          .filter(n => Number.isInteger(n) && n > 0);
        let stopped = 0;
        for (const pid of pids) {
          try {
            process.kill(pid);
            stopped += 1;
          } catch {
            /* already gone */
          }
        }
        resolve(stopped);
      },
    );
  });
}

export class AgentConnectService extends Service {
  async getStatus(): Promise<IAgentStatus> {
    return {
      mcpUrl: MCP_URL,
      mcpRunning: await mcpRunning(),
      hermesFound: fs.existsSync(hermesExe()),
      nvidiaPort: nvidiaPort(),
      profileExists: fs.existsSync(path.join(profileDir(AGENT_PROFILE), 'config.yaml')),
    };
  }

  /**
   * @param makeDefault also make the Streamlabs profile the one Hermes opens. Off unless the
   *   user asks: it changes how their Hermes starts, outside our own profile.
   */
  async connectHermes(makeDefault = false): Promise<IConnectResult> {
    const steps: IConnectStep[] = [];
    const fail = (label: string, detail: string): IConnectResult => {
      steps.push({ label, ok: false, detail });
      return { ok: false, steps };
    };

    // 1. Prerequisites
    if (!fs.existsSync(hermesExe())) {
      return fail('Find Hermes', `Hermes isn't installed (looked for ${hermesExe()}).`);
    }
    steps.push({ label: 'Find Hermes', ok: true });

    if (!(await mcpRunning())) {
      return fail(
        'Streamlabs agent connection',
        `The Streamlabs MCP server isn't answering at ${MCP_URL}. Restart Streamlabs and try again.`,
      );
    }
    steps.push({ label: 'Streamlabs agent connection', ok: true, detail: MCP_URL });

    const port = nvidiaPort();
    steps.push(
      port
        ? { label: 'Find NVIDIA Broadcast', ok: true, detail: `port ${port}` }
        : {
            label: 'Find NVIDIA Broadcast',
            ok: false,
            detail:
              'Not found: background effects will not be available. Start NVIDIA Broadcast and connect again.',
          },
    );

    // 2. The profile: a clone of their active one (keeps their model and logins), or update it.
    const dir = profileDir(AGENT_PROFILE);
    const configFile = path.join(dir, 'config.yaml');
    if (!fs.existsSync(configFile)) {
      try {
        await hermes([
          'profile',
          'create',
          AGENT_PROFILE,
          '--clone',
          '--no-alias',
          '--description',
          'Streamlabs Desktop: build and style scenes, webcam effects, stream health',
        ]);
        steps.push({
          label: 'Create the Streamlabs profile',
          ok: true,
          detail: 'from your current Hermes profile',
        });
      } catch (e: unknown) {
        return fail('Create the Streamlabs profile', e instanceof Error ? e.message : String(e));
      }
    } else {
      steps.push({ label: 'Streamlabs profile', ok: true, detail: 'already there; updating it' });
    }

    // 3. Our settings, in one write.
    try {
      const config = yaml.safeLoad(fs.readFileSync(configFile, 'utf8')) ?? {};
      setPath(config, ['mcp_servers', 'streamlabs'], { url: MCP_URL, enabled: true });
      if (port) {
        setPath(config, ['mcp_servers', 'nvidia-broadcast'], {
          url: `http://127.0.0.1:${port}/gateway`,
          enabled: true,
          tools: { include: NVIDIA_TOOLS },
        });
      }
      // Skills to read the playbook, vision for screenshots, clarify, and terminal for the
      // stream watcher (the skill allows exactly one terminal command).
      setPath(config, ['platform_toolsets', 'cli'], ['skills', 'vision', 'clarify', 'terminal']);
      setPath(config, ['skills', 'auto_load'], ['streamlabs-studio']);
      // Agent features that cost time or interrupt a demo.
      setPath(config, ['tools', 'tool_search', 'enabled'], 'off');
      setPath(config, ['curator', 'enabled'], false);
      setPath(config, ['auxiliary', 'background_review', 'enabled'], false);
      fs.writeFileSync(configFile, yaml.safeDump(config, { lineWidth: -1, noRefs: true }), 'utf8');
      steps.push({ label: 'Connect Hermes to Streamlabs and NVIDIA Broadcast', ok: true });
    } catch (e: unknown) {
      return fail('Update the profile settings', e instanceof Error ? e.message : String(e));
    }

    // 4. The skill and the stream watcher.
    try {
      const skillDir = path.join(dir, 'skills', 'media', 'streamlabs-studio');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.copyFileSync(assetPath('SKILL.md'), path.join(skillDir, 'SKILL.md'));
      const bin = path.join(hermesHome(), 'bin');
      fs.copyFileSync(assetPath('stream-watch'), path.join(bin, 'stream-watch'));
      fs.copyFileSync(
        assetPath('stream_health_monitor.py'),
        path.join(bin, 'stream_health_monitor.py'),
      );
      steps.push({ label: 'Install the Streamlabs skill and stream watcher', ok: true });
    } catch (e: unknown) {
      return fail('Install the Streamlabs skill', e instanceof Error ? e.message : String(e));
    }

    // 5. Optionally, make it the profile Hermes opens (the command line and the desktop app).
    if (makeDefault) {
      try {
        await hermes(['profile', 'use', AGENT_PROFILE]);
        const desktopFile = path.join(
          process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming'),
          'Hermes',
          'active-profile.json',
        );
        let desktop: any = {};
        try {
          desktop = JSON.parse(fs.readFileSync(desktopFile, 'utf8'));
        } catch {
          /* the desktop app hasn't written it yet */
        }
        desktop.profile = AGENT_PROFILE;
        desktop.connectionProfiles = {
          ...(desktop.connectionProfiles ?? {}),
          local: AGENT_PROFILE,
        };
        desktop.defaultRoute = {
          connectionId: null,
          ...(desktop.defaultRoute ?? {}),
          profile: AGENT_PROFILE,
        };
        fs.mkdirSync(path.dirname(desktopFile), { recursive: true });
        fs.writeFileSync(desktopFile, JSON.stringify(desktop, null, 2), 'utf8');
        steps.push({ label: 'Make default profile in Hermes', ok: true });
      } catch (e: unknown) {
        return fail('Make default profile in Hermes', e instanceof Error ? e.message : String(e));
      }
    }

    // 6. Restart Hermes' background service (the gateway). It keeps running when the Hermes
    // window is closed, and keeps a server's old connection when only its settings change, so
    // without this a new or changed profile can be left with no working Streamlabs tools.
    try {
      const stopped = await restartHermesGateway();
      steps.push({
        label: "Restart Hermes' background service",
        ok: true,
        detail: stopped ? 'Hermes starts it again by itself' : 'it was not running',
      });
    } catch (e: unknown) {
      steps.push({
        label: "Restart Hermes' background service",
        ok: false,
        detail: `${
          e instanceof Error ? e.message : String(e)
        }. Restart your computer if Streamlabs tools don't show up.`,
      });
    }

    return {
      ok: true,
      steps,
      next: makeDefault
        ? 'Open Hermes and start a new chat.'
        : `Open Hermes, switch to the "${AGENT_PROFILE}" profile (the profile menu), and start a new chat.`,
    };
  }
}
