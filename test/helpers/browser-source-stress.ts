import * as http from 'http';
import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';

/** Use Desktop's existing profile setting to avoid Electron GPU teardown hangs on Windows. */
export function prepareBrowserSourceTestProfile(t: { context: { cacheDir: string }; log(message: string): void }): void {
  if (process.platform !== 'win32' || process.env.SLOBS_TEST_ENABLE_ELECTRON_HA === '1') return;
  const userDataDir = path.join(t.context.cacheDir, 'slobs-client');
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(path.join(userDataDir, 'HADisable'), '');
  t.log('Electron hardware acceleration disabled for this test run');
}

export type TBrowserScenario =
  | 'chat'
  | 'alerts'
  | 'goals'
  | 'canvas'
  | 'webgl'
  | 'network'
  | 'combined';

export interface IBrowserFixtureReport {
  run: string;
  documentId: string;
  scenario: TBrowserScenario;
  uptime: number;
  counters: {
    chat: number;
    alerts: number;
    videoEnds: number;
    goals: number;
    frames: number;
    webglFrames: number;
    sse: number;
    fetch: number;
    reconnects: number;
  };
  videoStatus: string;
  webglStatus: string;
  networkStatus: string;
  receivedAt: number;
}

const fixturePath = path.resolve(process.cwd(), 'test', 'data', 'browser-source-stress', 'server.js');
const fixture = require(fixturePath) as {
  server: http.Server;
  reports: Map<string, IBrowserFixtureReport>;
  visits: Map<string, {
    documentGets: number;
    lastDocumentPath: string | null;
    reportAttempts: number;
    reportStatusCounts: Record<string, number>;
    lastReportStatus: number | null;
    lastReportReason: string | null;
    lastDocumentAt: number | null;
    lastReportAt: number | null;
  }>;
  assetRequests: {
    appJs: number;
    styleCss: number;
    lastAppJsAt: number | null;
    lastStyleCssAt: number | null;
  };
};

let nextRun = 0;

export function newBrowserRun(): string {
  nextRun += 1;
  return `browser_${process.pid}_${Date.now()}_${nextRun}`;
}

export function browserFixtureUrl(
  origin: string,
  scenario: TBrowserScenario,
  run: string,
  load: 'normal' | 'heavy' | 'extreme' = 'normal',
): string {
  return `${origin}/${scenario}?load=${load}&run=${run}`;
}

export function browserScenarioReady(scenario: TBrowserScenario, report: IBrowserFixtureReport): boolean {
  if (report.scenario !== scenario) return false;
  switch (scenario) {
    case 'chat':
      return report.counters.chat >= 5;
    case 'alerts':
      return report.counters.alerts > 0 &&
        (report.videoStatus === 'playing' || report.videoStatus === 'ended');
    case 'goals':
      return report.counters.goals >= 2;
    case 'canvas':
      return report.counters.frames >= 3;
    case 'webgl':
      return report.webglStatus === 'active' && report.counters.webglFrames >= 3;
    case 'network':
      return report.counters.fetch > 0 && report.counters.sse > 0;
    case 'combined':
      return report.counters.chat > 0 &&
        report.counters.alerts > 0 &&
        report.counters.goals > 0 &&
        report.counters.frames > 0 &&
        report.counters.fetch > 0 &&
        report.counters.sse > 0 &&
        (report.videoStatus === 'playing' || report.videoStatus === 'ended');
  }
}

export async function startBrowserFixture(): Promise<string> {
  fixture.reports.clear();
  fixture.visits.clear();
  fixture.assetRequests.appJs = 0;
  fixture.assetRequests.styleCss = 0;
  fixture.assetRequests.lastAppJsAt = null;
  fixture.assetRequests.lastStyleCssAt = null;
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      fixture.server.removeListener('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      fixture.server.removeListener('error', onError);
      resolve();
    };
    fixture.server.once('error', onError);
    fixture.server.once('listening', onListening);
    fixture.server.listen(0, '127.0.0.1');
  });
  const address = fixture.server.address() as net.AddressInfo;
  const origin = `http://127.0.0.1:${address.port}`;
  await new Promise<void>((resolve, reject) => {
    const request = http.get(`${origin}/chat`, response => {
      response.resume();
      if (response.statusCode === 200) resolve();
      else reject(new Error(`Browser fixture health check returned HTTP ${response.statusCode}`));
    });
    request.setTimeout(5000, () => request.destroy(new Error('Browser fixture health check timed out')));
    request.on('error', reject);
  });
  return origin;
}

export async function stopBrowserFixture(): Promise<void> {
  if (!fixture.server.listening) return;
  await new Promise<void>((resolve, reject) => {
    fixture.server.close(error => (error ? reject(error) : resolve()));
  });
  fixture.reports.clear();
  fixture.visits.clear();
}

export async function waitForBrowserReport(
  run: string,
  predicate: (report: IBrowserFixtureReport) => boolean,
  timeoutMs = 30000,
): Promise<IBrowserFixtureReport> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const report = fixture.reports.get(run);
    if (report && predicate(report)) return report;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const lastReport = fixture.reports.get(run);
  const visit = fixture.visits.get(run);
  const diagnosis = !visit || visit.documentGets === 0
    ? 'No document request reached the fixture server'
    : visit.reportAttempts === 0
      ? 'Document requested, but no report request reached the fixture server'
      : !lastReport
        ? `Report request rejected (HTTP ${visit.lastReportStatus}: ${visit.lastReportReason})`
        : 'Page reported, but the scenario readiness condition was not met';
  throw new Error(
    `No browser report matched run ${run} within ${timeoutMs}ms. ${diagnosis}; last report: ${JSON.stringify(
      lastReport || null,
    )}; requests: ${JSON.stringify(visit || null)}; assets: ${JSON.stringify(fixture.assetRequests)}`,
  );
}
