/**
 * MCP over HTTP (Streamable HTTP), for clients that connect by URL instead of launching a
 * command: http://127.0.0.1:<port>/mcp. Streamlabs runs the server this way, so an agent only
 * needs the address -- no Node, paths or scripts on the user's side.
 *
 * Local only: bound to 127.0.0.1, with DNS-rebinding protection, so a web page in a browser
 * can't reach it. One MCP server per session; all sessions share one Streamlabs connection.
 */

import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { log } from './log.js';

const HOST = '127.0.0.1';
const MAX_BODY = 4 * 1024 * 1024;
/**
 * Clients that go away without ending their session (a restarted agent) leave it open. Close
 * sessions idle this long, and keep at most MAX_SESSIONS (least recently used go first). Both
 * are generous: an agent may sit idle for hours and must not lose its connection.
 */
const IDLE_CLOSE_MS = 12 * 60 * 60 * 1000;
const MAX_SESSIONS = 16;

function readJson(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('request too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(text ? JSON.parse(text) : undefined);
      } catch {
        reject(new Error('invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendError(res: http.ServerResponse, status: number, message: string): void {
  if (res.headersSent) return;
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
}

export async function runHttp(port: number, makeServer: () => McpServer): Promise<void> {
  const sessions = new Map<string, StreamableHTTPServerTransport>();
  const lastUsed = new Map<string, number>();
  const closeSession = (id: string) => {
    const t = sessions.get(id);
    sessions.delete(id);
    lastUsed.delete(id);
    t?.close().catch(() => {});
  };
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [id, at] of lastUsed) if (now - at > IDLE_CLOSE_MS) closeSession(id);
  }, 10 * 60 * 1000);
  sweep.unref();
  const allowedHosts = [`${HOST}:${port}`, `localhost:${port}`];

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://${HOST}:${port}`);

    // A plain health check for setup screens and scripts: is the server up?
    if (url.pathname === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, sessions: sessions.size }));
      return;
    }
    if (url.pathname !== '/mcp') {
      sendError(res, 404, 'Not found: the MCP endpoint is /mcp');
      return;
    }

    try {
      const body = req.method === 'POST' ? await readJson(req) : undefined;
      const sid = req.headers['mcp-session-id'];
      let transport = typeof sid === 'string' ? sessions.get(sid) : undefined;

      if (!transport) {
        if (req.method !== 'POST' || !isInitializeRequest(body)) {
          sendError(res, 400, 'No valid session: start with an initialize request');
          return;
        }
        const t = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableDnsRebindingProtection: true,
          allowedHosts,
          onsessioninitialized: id => {
            sessions.set(id, t);
            lastUsed.set(id, Date.now());
            // Over the cap: close the least recently used session.
            if (sessions.size > MAX_SESSIONS) {
              const oldest = [...lastUsed].sort((x, y) => x[1] - y[1])[0];
              if (oldest && oldest[0] !== id) closeSession(oldest[0]);
            }
            log(`http: session ${id} opened (${sessions.size} open)`);
          },
        });
        t.onclose = () => {
          if (t.sessionId) lastUsed.delete(t.sessionId);
          if (t.sessionId && sessions.delete(t.sessionId)) {
            log(`http: session ${t.sessionId} closed (${sessions.size} open)`);
          }
        };
        await makeServer().connect(t);
        transport = t;
      }

      if (transport.sessionId) lastUsed.set(transport.sessionId, Date.now());
      await transport.handleRequest(req, res, body);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log('http: request failed:', msg);
      sendError(res, 500, msg);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, HOST, () => resolve());
  });
  log(`MCP server listening on http://${HOST}:${port}/mcp`);
}
