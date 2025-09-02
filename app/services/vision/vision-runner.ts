import { spawn, ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';
import path from 'node:path';
import { platform } from 'node:process';
import * as remote from '@electron/remote';
import http from 'http';
import { AddressInfo } from 'node:net';
import Emittery from 'emittery';
import pMemoize from 'p-memoize';

export type VisionRunnerStartOptions = { debugMode?: boolean };

type VisionRunnerEvents = {
  exit: { code: number | null; signal: NodeJS.Signals | null; };
  stdout: string;
  stderr: string;
};

export class VisionRunner extends Emittery<VisionRunnerEvents> {
  private proc?: ChildProcessWithoutNullStreams;
  private port?: number;

  private log(...args: any[]) { console.log('[VisionRunner]', ...args); }

  get isRunning() { return !!this.proc && this.proc.exitCode == null; }

  ensureStarted = pMemoize(async ({ debugMode = false }: VisionRunnerStartOptions = {}): Promise<{ pid: number; port: number }> => {
    if (this.isRunning) {
      return {
        pid: this.proc.pid!,
        port: this.port!
      }
    }

    return await this.restart({ debugMode });
  }, { cache: false });

  stop = pMemoize(async () => {
    await this.stopChild();
  }, { cache: false });

  private async restart({ debugMode = false }: VisionRunnerStartOptions = {}): Promise<{ pid: number; port: number }> {
    this.log('restart()');

    // make sure we're stopped first
    await this.stopChild();

    const binaryPath = path.resolve(
      path.join(remote.app.getPath('userData'), '..', 'streamlabs-vision'),
      'bin',
      'vision.exe',
    );

    const port = await getFreePort();

    const args = ['--port', `${port}`];

    if (debugMode) {
      args.push('--debug');
    }

    const child = spawn(binaryPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    this.proc = child;

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (data: string) => this.emit('stdout', data));
    child.stderr.on('data', (data: string) => this.emit('stderr', data));
    child.once('exit', (code, signal) => {
      this.proc = undefined;
      this.port = undefined;
      this.emit('exit', { code, signal });
    });

    this.port = port;

    return { pid: child.pid!, port };
  }

  private async stopChild(): Promise<void> {
    const proc = this.proc;

    if (!proc) return;

    try {
      if (platform === 'win32') {
        // best effort: SIGTERM then taskkill if needed
        proc.kill();
      } else {
        proc.kill('SIGTERM');
      }
      await Promise.race([
        once(proc, 'exit'),
        new Promise(res => setTimeout(res, 10_000))
      ]);

      if (!proc.killed) {
        proc.kill('SIGKILL');
      }
    } catch (err) {
      this.log('Error stopping child process:', err);
    }
  }
}

function getFreePort() {
  return new Promise<number>(resolve => {
    const server = http.createServer();

    server.on('listening', () => {
      const port = (server.address() as AddressInfo).port;

      server.close();
      server.unref();

      resolve(port);
    });

    server.listen();
  });
}