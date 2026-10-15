// Temporary, opt-in diagnostics for the Game Capture renderer errors seen only in CI.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

module.exports = function installRendererDiagnostics() {
  const logFile = path.join(
    process.env.SLOBS_CACHE_DIR,
    'slobs-client',
    'renderer-diagnostics.jsonl',
  );
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
  } catch (_) {
    return;
  }
  let records = 0;

  function write(event, details) {
    if (records++ >= 100) return;
    try {
      fs.appendFileSync(
        logFile,
        `${JSON.stringify({ time: new Date().toISOString(), event, ...details })}\n`,
      );
    } catch (_) {
      // Diagnostic I/O must not replace the original failure.
    }
  }

  function stripQuery(url) {
    return url && url.split(/[?#]/)[0];
  }

  app.on('web-contents-created', (_event, contents) => {
    let attached = false;
    function attach() {
      if (attached || contents.isDestroyed() || !contents.getURL().endsWith('windowId=child')) {
        return;
      }
      try {
        contents.debugger.attach('1.3');
        attached = true;
        write('attached', { webContentsId: contents.id });
        contents.debugger.sendCommand('Runtime.enable').catch(error => {
          write('enable-failed', { message: error.message });
        });
      } catch (error) {
        write('attach-failed', { message: error.message });
      }
    }

    contents.on('dom-ready', attach);
    contents.on('did-start-loading', attach);
    contents.debugger.on('detach', (_event, reason) => {
      if (attached) write('detached', { webContentsId: contents.id, reason });
      attached = false;
    });
    contents.debugger.on('message', (_event, method, params) => {
      if (method !== 'Runtime.exceptionThrown') return;
      const details = params.exceptionDetails;
      write('exception', {
        webContentsId: contents.id,
        text: details.text,
        description: details.exception?.description?.slice(0, 8000),
        url: stripQuery(details.url),
        lineNumber: details.lineNumber,
        columnNumber: details.columnNumber,
        frames: details.stackTrace?.callFrames.slice(0, 30).map(frame => ({
          functionName: frame.functionName,
          url: stripQuery(frame.url),
          lineNumber: frame.lineNumber,
          columnNumber: frame.columnNumber,
        })),
      });
      Promise.resolve()
        .then(() =>
          contents.executeJavaScript(`(() => {
        const manager = window.servicesManager;
        if (!manager) return null;
        const child = manager.getResource('WindowsService').state.child;
        const sourceId = child.queryParams && child.queryParams.sourceId;
        const source = sourceId && manager.getResource('SourcesService').views.getSource(sourceId);
        return {
          componentName: child.componentName,
          isShown: child.isShown,
          sourceId,
          sourceExists: !!source,
          sourceType: source && source.type,
        };
      })()`),
        )
        .then(snapshot => write('window-state', snapshot || {}))
        .catch(error => {
          write('snapshot-failed', { message: error.message });
        });
    });
  });
};
