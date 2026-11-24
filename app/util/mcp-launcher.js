/**
 * Runs the Streamlabs MCP server (mcp/) next to the app, so an AI agent can control Streamlabs
 * by connecting to http://127.0.0.1:28195/mcp -- no Node, scripts or paths on the user's side.
 *
 * The server is one bundled file (mcp: `npm run bundle`), run with Electron's own Node runtime
 * (ELECTRON_RUN_AS_NODE). It talks to Streamlabs through the same local API as any other
 * client (the named pipe), so it needs nothing from this process beyond being started.
 *
 * Plain JS on purpose: main.js loads it before any bundling. Listed in electron-builder files.
 *
 * SLOBS_MCP=0 turns it off; SLOBS_MCP_PORT changes the port; SLD_MCP_MODE picks the tool set
 * (default "demo").
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const DEFAULT_PORT = 28195;
const MAX_RESTARTS = 5;

function scriptPath(app) {
  // Installed: shipped next to the executable (electron-builder extraFiles). Dev: the mcp/
  // project's bundle in the repo.
  return app.isPackaged
    ? path.join(path.dirname(process.execPath), 'mcp', 'streamlabs-mcp.cjs')
    : path.join(__dirname, '..', '..', 'mcp', 'bundle', 'streamlabs-mcp.cjs');
}

function startMcpServer(app, logger = console) {
  const noop = { stop() {}, port: null };
  if (process.env.SLOBS_MCP === '0') {
    logger.log('[mcp] disabled (SLOBS_MCP=0)');
    return noop;
  }
  const script = scriptPath(app);
  if (!fs.existsSync(script)) {
    logger.log(`[mcp] not started: ${script} not found (run "npm run bundle" in mcp/)`);
    return noop;
  }

  const port = Number(process.env.SLOBS_MCP_PORT) || DEFAULT_PORT;
  const logFile = path.join(app.getPath('userData'), 'mcp-server.log');
  let child = null;
  let stopped = false;
  let restarts = 0;

  const launch = () => {
    child = spawn(process.execPath, [script, `--http=${port}`], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        SLD_MCP_MODE: process.env.SLD_MCP_MODE || 'demo',
        SLD_MCP_LOG: logFile,
      },
      stdio: 'ignore',
      windowsHide: true,
    });
    logger.log(`[mcp] started on http://127.0.0.1:${port}/mcp (pid ${child.pid}, log ${logFile})`);
    child.on('exit', code => {
      child = null;
      if (stopped) return;
      restarts += 1;
      if (restarts > MAX_RESTARTS) {
        logger.log(`[mcp] exited (${code}) ${MAX_RESTARTS} times; not restarting. See ${logFile}`);
        return;
      }
      const delay = Math.min(30000, 1000 * 2 ** restarts);
      logger.log(`[mcp] exited (${code}); restarting in ${delay} ms`);
      setTimeout(() => {
        if (!stopped) launch();
      }, delay);
    });
  };

  launch();
  return {
    port,
    stop() {
      stopped = true;
      if (child) child.kill();
    },
  };
}

module.exports = { startMcpServer };
