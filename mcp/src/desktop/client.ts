/**
 * JSON-RPC client for Streamlabs Desktop.
 *
 * Ported from test/helpers/api-client.ts with six deliberate changes -- see mcp/README.md.
 * The short version:
 *   1. No requestSync / getResource Proxy  (they need `deasync`, which blocks the event loop)
 *   2. Inbound read buffering              (the original splits raw chunks on \n and will
 *                                           throw on any response the OS splits mid-frame)
 *   3. PROMISE envelopes resolved here     (the original only did this on the sync path, so
 *                                           goLive/prepopulateInfo would hang forever)
 *   4. Memoized connect lifecycle          (the original leaks stale resolve/reject closures
 *                                           and hangs in-flight requests on disconnect)
 *   5. Bootstrap ordering enforced         (forceRequests BEFORE listenAllSubscriptions)
 *   6. Request-size guard + stderr logging (console.log would corrupt the MCP stdio transport)
 */

import * as net from 'node:net';
import { log } from '../log.js';
import {
  IEventEnvelope,
  IJsonRpcRequest,
  IJsonRpcResponse,
  isEvent,
  isSubscription,
} from './types.js';

// NOTE: "slobs" here is NOT ours to rename -- it is the pipe name the app itself creates
// (TcpServerService defaultState.namedPipe.pipeName). Same goes for the SLOBS_CACHE_DIR
// env var (main.js:59) and the %APPDATA%\slobs-client data directory.
const PIPE_PATH = '\\\\.\\pipe\\slobs';
const TCP_PORT = 28194;
const TCP_HOST = '127.0.0.1';

/**
 * tcp-server.ts:329 hands each raw socket chunk straight to JSON.parse with no
 * reassembly, so an oversized request that the OS splits across two reads gets us
 * disconnected. Stay well under a single pipe read.
 */
const MAX_REQUEST_BYTES = 4096;
const MAX_READ_BUFFER_BYTES = 16 * 1024 * 1024;

const DEFAULT_TIMEOUT_MS = 20_000;
/** goLive does multi-platform network setup; 20s is not enough. */
const METHOD_TIMEOUT_MS: Record<string, number> = {
  goLive: 60_000,
  prepopulateInfo: 30_000,
  updateStreamSettings: 30_000,
  scheduleStream: 30_000,
  load: 60_000,
};

const BUSY_MESSAGE = 'API server is busy';

export class DesktopNotRunningError extends Error {
  constructor(cause?: string) {
    super(
      "Streamlabs Desktop doesn't appear to be running (couldn't reach its local API). " +
        'Start Streamlabs Desktop and try again.' +
        (cause ? ` [${cause}]` : ''),
    );
    this.name = 'DesktopNotRunningError';
  }
}

export class DesktopRpcError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
    this.name = 'DesktopRpcError';
  }
}

interface PendingRequest {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  timer: NodeJS.Timeout;
  label: string;
}

export class DesktopClient {
  private socket: net.Socket | null = null;
  /** Memoized in-flight connect. Cleared on close. (fix #4) */
  private connecting: Promise<void> | null = null;
  private readBuffer = '';
  private nextId = 1;

  /** keyed by JSON-RPC request id */
  private pending = new Map<string, PendingRequest>();
  /** keyed by the uuid resourceId of a PROMISE envelope (fix #3) */
  private promises = new Map<string, PendingRequest>();

  private eventHandlers: Array<(e: IEventEnvelope) => void> = [];
  private reconnectHandlers: Array<() => void> = [];
  private hasConnectedBefore = false;

  onEvent(cb: (e: IEventEnvelope) => void): void {
    this.eventHandlers.push(cb);
  }

  /** Fired after a successful (re)connect and bootstrap, so callers can resubscribe. */
  onReconnect(cb: () => void): void {
    this.reconnectHandlers.push(cb);
  }

  isConnected(): boolean {
    return !!this.socket && !this.socket.destroyed;
  }

  // ---------------------------------------------------------------- connect

  async ensureConnected(): Promise<void> {
    if (this.isConnected()) return;
    if (this.connecting) return this.connecting;

    this.connecting = this.doConnect()
      .then(async () => {
        await this.bootstrap();
        const isReconnect = this.hasConnectedBefore;
        this.hasConnectedBefore = true;
        if (isReconnect) log('reconnected to Streamlabs');
        for (const cb of this.reconnectHandlers) {
          try {
            cb();
          } catch (e) {
            log('reconnect handler threw', e);
          }
        }
      })
      .catch(e => {
        this.connecting = null;
        throw e;
      });

    return this.connecting;
  }

  private doConnect(): Promise<void> {
    // Prefer the named pipe on Windows; fall back to TCP, which is always listening.
    const targets: Array<() => net.Socket> =
      process.platform === 'win32'
        ? [() => net.createConnection(PIPE_PATH), () => net.createConnection(TCP_PORT, TCP_HOST)]
        : [() => net.createConnection(TCP_PORT, TCP_HOST)];

    const attempt = (i: number): Promise<void> =>
      new Promise<void>((resolve, reject) => {
        if (i >= targets.length) {
          reject(new DesktopNotRunningError('no transport available'));
          return;
        }
        const socket = targets[i]();
        let settled = false;

        socket.once('connect', () => {
          settled = true;
          this.attachSocket(socket);
          resolve();
        });

        socket.once('error', (err: NodeJS.ErrnoException) => {
          if (settled) return; // post-connect errors are handled by attachSocket
          settled = true;
          socket.destroy();
          log(`connect attempt ${i} failed: ${err.code ?? err.message}`);
          attempt(i + 1).then(resolve, reject);
        });
      });

    return attempt(0).catch(e => {
      throw e instanceof DesktopNotRunningError ? e : new DesktopNotRunningError(String(e));
    });
  }

  private attachSocket(socket: net.Socket): void {
    this.socket = socket;
    this.readBuffer = '';

    socket.on('data', (chunk: Buffer) => this.onData(chunk));

    const teardown = (why: string) => {
      if (this.socket !== socket) return;
      log(`socket closed (${why})`);
      this.socket = null;
      this.connecting = null;
      this.readBuffer = '';
      this.failAllInFlight(new DesktopNotRunningError(`connection lost (${why})`));
    };

    socket.on('close', () => teardown('close'));
    socket.on('end', () => teardown('end'));
    socket.on('error', err => {
      log('socket error', err);
      teardown('error');
    });
  }

  /** fix #4: nothing may hang forever when the app goes away. */
  private failAllInFlight(err: Error): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
    for (const [, p] of this.promises) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.promises.clear();
  }

  /**
   * fix #5: forceRequests MUST come first. isEventsSendingStopped starts true
   * (tcp-server.ts:134) and is re-raised during scene-collection loads, and
   * sendResponse (:567) drops *normal responses* while it is set.
   * listenAllSubscriptions is then required for PROMISE results to reach us at all,
   * because the fan-out (:436-459) matches on client.subscriptions and promise ids
   * are fresh uuids that are never in that list.
   */
  private async bootstrap(): Promise<void> {
    await this.rawRequest('TcpServerService', 'forceRequests', [true]);
    await this.rawRequest('TcpServerService', 'listenAllSubscriptions', []);
    log('bootstrap complete');
  }

  // ------------------------------------------------------------------ read

  /** fix #2: accumulate, split on LF, keep the trailing partial frame. */
  private onData(chunk: Buffer): void {
    this.readBuffer += chunk.toString('utf8');

    if (this.readBuffer.length > MAX_READ_BUFFER_BYTES) {
      log('read buffer overflow, destroying socket');
      this.readBuffer = '';
      this.socket?.destroy();
      return;
    }

    const parts = this.readBuffer.split('\n');
    this.readBuffer = parts.pop() ?? '';

    for (const line of parts) {
      if (!line.trim()) continue;
      let message: IJsonRpcResponse;
      try {
        message = JSON.parse(line);
      } catch {
        log(`dropping unparseable frame (${line.length} bytes)`);
        continue;
      }
      this.dispatch(message);
    }
  }

  private dispatch(message: IJsonRpcResponse): void {
    // Response to one of our requests?
    if (message.id != null) {
      const req = this.pending.get(message.id);
      if (req) {
        this.pending.delete(message.id);
        clearTimeout(req.timer);
        if (message.error) {
          req.reject(new DesktopRpcError(message.error.message, message.error.code));
        } else {
          req.resolve(message.result);
        }
        return;
      }
    }

    const result = message.result;
    if (!isEvent(result)) return;

    if (result.emitter === 'PROMISE') {
      // fix #3: a deferred method result arriving out of band.
      const p = this.promises.get(result.resourceId);
      if (!p) return;
      this.promises.delete(result.resourceId);
      clearTimeout(p.timer);
      if (result.isRejected) {
        p.reject(new DesktopRpcError(`${p.label} rejected: ${JSON.stringify(result.data)}`));
      } else {
        p.resolve(result.data);
      }
      return;
    }

    // A pushed RxJS event.
    for (const cb of this.eventHandlers) {
      try {
        cb(result);
      } catch (e) {
        log('event handler threw', e);
      }
    }
  }

  // ----------------------------------------------------------------- write

  /**
   * Call a method (or read a property -- rpc-api.ts treats a non-function the same way)
   * on a Streamlabs resource. Resolves deferred PROMISE results transparently.
   */
  async request<T = unknown>(resource: string, method: string, args: unknown[] = []): Promise<T> {
    await this.ensureConnected();

    let result: unknown;
    try {
      result = await this.rawRequest(resource, method, args);
    } catch (e) {
      // The app pauses request handling during scene-collection loads and editor drags.
      // We set forceRequests on connect, but re-assert and retry in case we raced a load.
      if (e instanceof DesktopRpcError && e.message.includes(BUSY_MESSAGE)) {
        result = await this.retryBusy(resource, method, args);
      } else {
        throw e;
      }
    }

    if (isSubscription(result) && result.emitter === 'PROMISE') {
      log(`   ${resource}.${method} deferred -> awaiting promise ${result.resourceId}`);
      return (await this.awaitPromise(result.resourceId, `${resource}.${method}`, method)) as T;
    }
    return result as T;
  }

  private async retryBusy(resource: string, method: string, args: unknown[]): Promise<unknown> {
    const delays = [250, 500, 1000];
    let lastErr: unknown;
    for (const delay of delays) {
      await new Promise(r => setTimeout(r, delay));
      try {
        await this.rawRequest('TcpServerService', 'forceRequests', [true]);
        return await this.rawRequest(resource, method, args);
      } catch (e) {
        lastErr = e;
        if (!(e instanceof DesktopRpcError && e.message.includes(BUSY_MESSAGE))) throw e;
      }
    }
    throw lastErr;
  }

  private awaitPromise(resourceId: string, label: string, method: string): Promise<unknown> {
    const timeoutMs = METHOD_TIMEOUT_MS[method] ?? DEFAULT_TIMEOUT_MS;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // Delete the entry -- the original leaks it.
        this.promises.delete(resourceId);
        reject(new DesktopRpcError(`${label} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.promises.set(resourceId, { resolve, reject, timer, label });
    });
  }

  /** One socket.write per request, size-guarded. No PROMISE unwrapping. */
  private rawRequest(resource: string, method: string, args: unknown[]): Promise<unknown> {
    const id = String(this.nextId++);
    const body: IJsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      // JSON.stringify drops `undefined` from arrays, which silently shifts positional
      // arity on the far side. Normalize to null.
      params: { resource, args: args.map(a => (a === undefined ? null : a)) },
    };

    const raw = `${JSON.stringify(body)}\n`;
    if (Buffer.byteLength(raw, 'utf8') > MAX_REQUEST_BYTES) {
      return Promise.reject(
        new DesktopRpcError(
          `Request ${resource}.${method} is ${Buffer.byteLength(raw)} bytes, over the ` +
            `${MAX_REQUEST_BYTES}-byte frame limit. Split it into smaller calls.`,
        ),
      );
    }

    const socket = this.socket;
    if (!socket || !socket.writable) {
      return Promise.reject(new DesktopNotRunningError('socket not writable'));
    }

    const timeoutMs = METHOD_TIMEOUT_MS[method] ?? DEFAULT_TIMEOUT_MS;
    const label = `${resource}.${method}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new DesktopRpcError(`${label} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer, label });
      log(`-> ${label}`);
      socket.write(raw, err => {
        if (!err) return;
        this.pending.delete(id);
        clearTimeout(timer);
        reject(new DesktopRpcError(`write failed for ${label}: ${err.message}`));
      });
    });
  }

  /**
   * Subscribe to an RxJS observable. In this API you subscribe by *calling the
   * observable property as if it were a method*; rpc-api.ts then returns a
   * SUBSCRIPTION envelope and starts pushing EVENT frames.
   */
  async subscribe(resource: string, observable: string): Promise<string | null> {
    const result = await this.rawRequest(resource, observable, []);
    if (isSubscription(result) && result.emitter === 'STREAM') return result.resourceId;
    log(`subscribe(${resource}.${observable}) did not return a STREAM subscription`);
    return null;
  }

  close(): void {
    this.socket?.destroy();
    this.socket = null;
    this.connecting = null;
    this.failAllInFlight(new DesktopNotRunningError('client closed'));
  }
}
