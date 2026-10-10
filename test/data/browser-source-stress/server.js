// Standalone, loopback-only browser-source stress fixture. Run with `node server.js`.
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const HOST = '127.0.0.1';
const requestedPort = Number(process.env.PORT || 17842);
if (!Number.isInteger(requestedPort) || requestedPort < 1 || requestedPort > 65535) {
  throw new Error('PORT must be an integer from 1 to 65535');
}

const base = __dirname;
const routes = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/chat', ['chat.html', 'text/html; charset=utf-8']],
  ['/alerts', ['alerts.html', 'text/html; charset=utf-8']],
  ['/goals', ['goals.html', 'text/html; charset=utf-8']],
  ['/canvas', ['canvas.html', 'text/html; charset=utf-8']],
  ['/webgl', ['webgl.html', 'text/html; charset=utf-8']],
  ['/network', ['network.html', 'text/html; charset=utf-8']],
  ['/combined', ['combined.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/README.md', ['README.md', 'text/markdown; charset=utf-8']],
]);
const mediaFile = path.resolve(base, '..', 'sources-files', 'media', 'alertbox.mp4');
const webmFile = path.resolve(base, 'alertbox.webm');
let pulseSequence = 0;
let eventSequence = 0;
const reports = new Map();
const maxReports = 100;
const visits = new Map();
const maxVisits = 100;
const assetRequests = { appJs: 0, styleCss: 0, lastAppJsAt: null, lastStyleCssAt: null };
const idPattern = /^[A-Za-z0-9_-]{1,80}$/;
const scenarios = new Set(['index', 'chat', 'alerts', 'goals', 'canvas', 'webgl', 'network', 'combined']);
const documentRoutes = new Set(['/', '/chat', '/alerts', '/goals', '/canvas', '/webgl', '/network', '/combined']);
const counterNames = ['chat', 'alerts', 'goals', 'frames', 'webglFrames', 'sse', 'fetch', 'reconnects', 'videoEnds'];
const reportFields = ['run', 'documentId', 'scenario', 'uptime', ...counterNames,
  'videoStatus', 'webglStatus', 'networkStatus'];

function recordVisit(run, kind, detail = {}) {
  if (!idPattern.test(run || '')) return;
  const now = Date.now();
  const visit = visits.get(run) || {
    documentGets: 0,
    lastDocumentPath: null,
    reportAttempts: 0,
    reportStatusCounts: {},
    lastReportStatus: null,
    lastReportReason: null,
    firstAt: now,
    lastAt: now,
    lastDocumentAt: null,
    lastReportAt: null,
  };
  visit.lastAt = now;
  if (kind === 'document') {
    visit.documentGets = Math.min(Number.MAX_SAFE_INTEGER, visit.documentGets + 1);
    visit.lastDocumentPath = detail.path;
    visit.lastDocumentAt = now;
  } else if (kind === 'report') {
    visit.reportAttempts = Math.min(Number.MAX_SAFE_INTEGER, visit.reportAttempts + 1);
    visit.reportStatusCounts[detail.status] = Math.min(Number.MAX_SAFE_INTEGER,
      (visit.reportStatusCounts[detail.status] || 0) + 1);
    visit.lastReportStatus = detail.status;
    visit.lastReportReason = detail.reason || null;
    visit.lastReportAt = now;
  }
  visits.delete(run);
  visits.set(run, visit);
  if (visits.size > maxVisits) visits.delete(visits.keys().next().value);
}

function sendText(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function serveFile(req, res, file, contentType, allowRange = false) {
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) return sendText(res, 404, 'File unavailable\n');
    const headers = {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': allowRange ? 'bytes' : 'none',
    };
    let start = 0;
    let end = stat.size - 1;
    let status = 200;
    if (allowRange && req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if (!match || (!match[1] && !match[2])) {
        res.writeHead(416, { ...headers, 'Content-Range': `bytes */${stat.size}` });
        return res.end();
      }
      if (match[1]) {
        start = Number(match[1]);
        end = match[2] ? Number(match[2]) : end;
      } else {
        const suffix = Number(match[2]);
        start = Math.max(0, stat.size - suffix);
      }
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) {
        res.writeHead(416, { ...headers, 'Content-Range': `bytes */${stat.size}` });
        return res.end();
      }
      end = Math.min(end, stat.size - 1);
      status = 206;
      headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
    }
    headers['Content-Length'] = end - start + 1;
    res.writeHead(status, headers);
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(file, { start, end });
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
}

function serveEvents(req, res, url) {
  const maxStreamMs = 8000;
  const dropParameter = url.searchParams.get('drop');
  const requestedDrop = dropParameter === null ? 12 : Number(dropParameter);
  const dropAfter = Number.isInteger(requestedDrop) ? Math.min(60, Math.max(0, requestedDrop)) : 12;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  let sent = 0;
  const writeEvent = () => {
    if (res.writableEnded) return;
    const id = ++eventSequence;
    const data = JSON.stringify({ id, time: Date.now(), value: (id * 37) % 101 });
    res.write(`id: ${id}\nevent: update\ndata: ${data}\n\n`);
    sent += 1;
    if (dropAfter && sent >= dropAfter) res.end();
  };
  writeEvent();
  if (res.writableEnded) return;
  const timer = setInterval(writeEvent, 500);
  const deadline = setTimeout(() => res.end(), maxStreamMs);
  res.on('close', () => {
    clearInterval(timer);
    clearTimeout(deadline);
  });
}

function serveReport(res, url) {
  const runHint = url.searchParams.get('run');
  const reject = (reason) => {
    recordVisit(runHint, 'report', { status: 400, reason });
    return sendText(res, 400, `${reason}\n`);
  };
  const values = {};
  for (const name of reportFields) {
    const all = url.searchParams.getAll(name);
    if (all.length !== 1) return reject(`Invalid report field: ${name}`);
    values[name] = all[0];
  }
  for (const name of url.searchParams.keys()) {
    if (!reportFields.includes(name)) return reject(`Unknown report field: ${name}`);
  }
  if (!idPattern.test(values.run) || !idPattern.test(values.documentId) || !scenarios.has(values.scenario)) {
    return reject('Invalid report identity');
  }
  const counters = {};
  for (const name of ['uptime', ...counterNames]) {
    if (!/^(0|[1-9][0-9]{0,12})$/.test(values[name])) return reject(`Invalid report number: ${name}`);
    values[name] = Number(values[name]);
  }
  for (const name of counterNames) counters[name] = values[name];
  for (const name of ['videoStatus', 'webglStatus', 'networkStatus']) {
    if (values[name].length > 160 || /[\x00-\x1f\x7f]/.test(values[name])) {
      return reject(`Invalid report status: ${name}`);
    }
  }
  const report = {
    run: values.run,
    documentId: values.documentId,
    scenario: values.scenario,
    uptime: values.uptime,
    counters,
    videoStatus: values.videoStatus,
    webglStatus: values.webglStatus,
    networkStatus: values.networkStatus,
    receivedAt: Date.now(),
  };
  reports.delete(values.run);
  reports.set(values.run, report);
  if (reports.size > maxReports) reports.delete(reports.keys().next().value);
  recordVisit(values.run, 'report', { status: 204 });
  res.writeHead(204, { 'Cache-Control': 'no-store' });
  res.end();
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      const rejectedUrl = new URL(req.url, `http://${HOST}`);
      if (rejectedUrl.pathname === '/api/report') {
        recordVisit(rejectedUrl.searchParams.get('run'), 'report', { status: 405, reason: 'GET or HEAD required' });
      }
    } catch { /* keep the existing 405 response for unsupported methods */ }
    return sendText(res, 405, 'GET or HEAD required\n');
  }
  let url;
  try {
    url = new URL(req.url, `http://${HOST}`);
  } catch {
    return sendText(res, 400, 'Invalid URL\n');
  }
  if (req.method === 'GET') {
    const now = Date.now();
    if (url.pathname === '/app.js') {
      assetRequests.appJs = Math.min(Number.MAX_SAFE_INTEGER, assetRequests.appJs + 1);
      assetRequests.lastAppJsAt = now;
    } else if (url.pathname === '/style.css') {
      assetRequests.styleCss = Math.min(Number.MAX_SAFE_INTEGER, assetRequests.styleCss + 1);
      assetRequests.lastStyleCssAt = now;
    }
  }
  if (url.pathname === '/api/pulse') {
    const id = ++pulseSequence;
    const body = JSON.stringify({ id, time: Date.now(), value: (id * 17) % 101 });
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    return res.end(req.method === 'HEAD' ? undefined : body);
  }
  if (url.pathname === '/api/report') {
    if (req.method !== 'GET') {
      recordVisit(url.searchParams.get('run'), 'report', { status: 405, reason: 'GET required' });
      return sendText(res, 405, 'GET required\n');
    }
    return serveReport(res, url);
  }
  if (url.pathname === '/api/events') {
    if (req.method === 'HEAD') return sendText(res, 405, 'GET required\n');
    return serveEvents(req, res, url);
  }
  if (url.pathname === '/media/alertbox.mp4') {
    return serveFile(req, res, mediaFile, 'video/mp4', true);
  }
  if (url.pathname === '/media/alertbox.webm') {
    return serveFile(req, res, webmFile, 'video/webm', true);
  }
  const route = routes.get(url.pathname);
  if (!route) return sendText(res, 404, 'Unknown fixture route\n');
  if (req.method === 'GET' && documentRoutes.has(url.pathname)) {
    recordVisit(url.searchParams.get('run'), 'document', { path: url.pathname });
  }
  return serveFile(req, res, path.join(base, route[0]), route[1]);
});

if (require.main === module) {
  server.listen(requestedPort, HOST, () => {
    console.log(`Browser source stress fixtures: http://${HOST}:${requestedPort}/`);
  });
}

module.exports = { server, reports, visits, assetRequests };
