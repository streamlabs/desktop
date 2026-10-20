import { test, useWebdriver } from '../helpers/webdriver';
import { focusWindow } from '../helpers/modules/core';

// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

interface IDownloadResult {
  first: { status: string; code?: string; message?: string };
  second: { status: string; code?: string; message?: string };
  cachedFailure: boolean;
  filesAfterFailure: string[];
  retryShared: boolean;
  requests: number;
  contents?: string;
  unexpectedError?: string;
}

function runDownloadScenario(scenario: string, done: (result: IDownloadResult) => void) {
  // Serialized WebDriver callbacks must stay synchronous; TypeScript's async helpers
  // belong to the test process and are unavailable in the worker window.
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const http = require('http');
  const https = require('https');
  const net = require('net');
  const originalGet = https.get;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-font-download-'));
  const fonts = path.join(directory, 'Fonts');
  const sockets = new Set<any>();
  let requests = 0;
  const payload = 'complete-font-download';
  const server =
    scenario === 'tls-reset'
      ? net.createServer((socket: any) => {
          requests++;
          socket.destroy();
        })
      : http.createServer((_request: any, response: any) => {
          requests++;
          if (requests === 1 && scenario === 'partial-response') {
            response.writeHead(200, { 'Content-Length': 1000 });
            response.write('partial-font');
            setTimeout(() => response.socket?.destroy(), 20);
          } else if (requests === 1 && scenario === 'http-error') {
            response.writeHead(404);
            response.end('not a font');
          } else {
            response.end(payload);
          }
        });
  server.on('connection', (socket: any) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
  });

  function cleanup() {
    https.get = originalGet;
    for (const socket of sockets) socket.destroy();
    return new Promise<void>(resolve => server.close(() => resolve())).then(() => {
      fs.rmSync(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 10 });
    });
  }

  new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    .then(() => {
      const base = `http://127.0.0.1:${server.address().port}/`;
      // Response and filesystem faults use real local HTTP streams. The TLS reset case
      // uses the real HTTPS transport, with a peer that closes the connection.
      https.get = (url: string, callback: Function) =>
        url.startsWith(base) ? http.get(url, callback) : originalGet.call(https, url, callback);

      const prototype = Object.getPrototypeOf(
        (window as any).servicesManager.getResource('FontLibraryService'),
      );
      const service = Object.create(prototype);
      Object.defineProperty(service, 'appService', {
        value: { appDataDirectory: directory },
      });
      service.fontDownloadPromises = {};
      service.libraryUrl = () =>
        scenario === 'tls-reset' ? base.replace('http:', 'https:') : base;
      if (scenario === 'write-error') {
        service.libraryPath = () => path.join(fonts, 'missing-directory', 'font.ttf');
      }

      function outcome(promise: Promise<string>): Promise<IDownloadResult['first']> {
        return new Promise(resolve => {
          const timer = setTimeout(() => resolve({ status: 'pending' }), 5000);
          promise.then(
            () => {
              clearTimeout(timer);
              resolve({ status: 'resolved' });
            },
            (error: any) => {
              clearTimeout(timer);
              resolve({ status: 'rejected', code: error.code, message: error.message });
            },
          );
        });
      }

      return outcome(service.downloadFont('font.ttf')).then(first => {
        const cachedFailure = Boolean(service.fontDownloadPromises['font.ttf']);
        const filesAfterFailure = fs.existsSync(fonts) ? fs.readdirSync(fonts) : [];
        if (scenario === 'write-error') delete service.libraryPath;
        const retry = service.downloadFont('font.ttf');
        const retryShared = retry === service.downloadFont('font.ttf');
        return outcome(retry).then(second => {
          const contents =
            second.status === 'resolved'
              ? fs.readFileSync(path.join(fonts, 'font.ttf'), 'utf8')
              : undefined;
          return {
            first,
            second,
            cachedFailure,
            filesAfterFailure,
            retryShared,
            requests,
            contents,
          };
        });
      });
    })
    .then(
      result => cleanup().then(() => done(result)),
      error => cleanup().then(() => done({ unexpectedError: error.message } as IDownloadResult)),
    );
}

for (const scenario of ['tls-reset', 'partial-response', 'http-error', 'write-error']) {
  test(`Font download handles ${scenario} without retaining a failed cache entry`, async t => {
    t.true(await focusWindow('worker'));
    const result = await t.context.app.client.executeAsync(runDownloadScenario, scenario);
    t.falsy(result.unexpectedError);
    t.is(result.first.status, 'rejected');
    t.false(result.cachedFailure);
    t.deepEqual(result.filesAfterFailure, []);
    t.true(result.retryShared);
    t.is(result.requests, 2);
    if (scenario === 'tls-reset') {
      t.is(result.first.code, 'ECONNRESET');
      t.is(result.second.status, 'rejected');
    } else {
      t.is(result.second.status, 'resolved');
      t.is(result.contents, 'complete-font-download');
    }
  });
}

test('A failed font download preserves the authored text-source settings', async t => {
  t.true(await focusWindow('worker'));
  const result = await t.context.app.client.executeAsync((done: (result: any) => void) => {
    const manager = (window as any).servicesManager;
    const fonts = manager.getResource('FontLibraryService');
    const sources = manager.getResource('SourcesService');
    const originalDownload = fonts.downloadFont;
    const filename = 'missing-font-download-test.ttf';
    let attemptedDownload = false;
    fonts.downloadFont = () => {
      attemptedDownload = true;
      return Promise.reject(new Error('Font download connection reset'));
    };
    const sourceType = process.platform === 'darwin' ? 'text_ft2_source' : 'text_gdiplus';
    const source = sources.createSource('Unavailable font', sourceType, {
      custom_font: filename,
      font: { face: 'Arial', size: 32, flags: 0 },
      text: 'Preserve this text',
    });
    setTimeout(() => {
      try {
        done({
          attemptedDownload,
          customFont: source.getObsInput().settings.custom_font,
          text: source.getObsInput().settings.text,
        });
      } finally {
        fonts.downloadFont = originalDownload;
      }
    }, 50);
  });
  t.true(result.attemptedDownload);
  t.is(result.customFont, 'missing-font-download-test.ttf');
  t.is(result.text, 'Preserve this text');
});
