// Electron entry point for driving the app outside the AVA test runner
// (e.g. interactive WebDriver / MCP sessions).
//
// electron-chromedriver does not reliably propagate its own environment to
// the Electron process it launches, so NODE_ENV / SLOBS_CACHE_DIR may not
// arrive that way. Setting them here — in the Electron main process, before
// requiring test-main.js — runs ahead of test-main.js's `NODE_ENV === 'test'`
// guard and keeps app data in an isolated dir (never the real install).
//
// The cache lives at <project-root>/.slobs-mcp-cache (derived from __dirname,
// which is the project root because chromedriver launches us via
// `--app=<root>/test-main-standalone.js`). main.js then sets:
//   appData  = SLOBS_CACHE_DIR                       (= <root>/.slobs-mcp-cache)
//   userData = <appData>/slobs-client                (= <root>/.slobs-mcp-cache/slobs-client)
// and Electron writes its DevToolsActivePort file into userData. ChromeDriver
// watches the dir it was given as `--user-data-dir` for that file, so the MCP
// `start_session` MUST pass `--user-data-dir=<root>/.slobs-mcp-cache/slobs-client`
// (same `<root>` it uses for the other args). Keeping the cache under the
// project root means the only value the caller substitutes is `<root>` — no
// OS-temp lookup, no path math — which is what makes a cold session reliable.
// (.slobs-mcp-cache is gitignored.)

const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
if (!process.env.SLOBS_CACHE_DIR) {
  process.env.SLOBS_CACHE_DIR = path.join(__dirname, '.slobs-mcp-cache');
}
fs.mkdirSync(path.join(process.env.SLOBS_CACHE_DIR, 'slobs-client'), { recursive: true });

require('./test-main.js');
