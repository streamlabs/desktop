/* eslint-disable no-inner-declarations */
////////////////////////////////////////////////////////////////////////////////
// Set Up Environment Variables
////////////////////////////////////////////////////////////////////////////////
const pjson = require('./package.json');
if (pjson.env === 'production') {
  process.env.NODE_ENV = 'production';
}
if (pjson.name === 'n-air-app-unstable' || pjson.name === 'n-air-app-upstream') {
  process.env.NAIR_UNSTABLE = true;
}
if (process.env.NODE_ENV !== 'production' && process.env.NAIR_UNSTABLE) {
  if (pjson.name !== 'n-air-app-upstream') {
    // DEBUG
    pjson.name = 'n-air-app-unstable';
  }
}
if (pjson.name === 'n-air-app-preview') {
  process.env.NAIR_PREVIEW = true;
}
if (pjson.name === 'n-air-app-ipc') {
  process.env.NAIR_IPC = true;
}
process.env.NAIR_VERSION = pjson.version;
process.env.NAIR_PRODUCT_NAME = pjson.buildProductName;

console.log(`pjson.name = ${pjson.name}`); // DEBUG

////////////////////////////////////////////////////////////////////////////////
// Modules and other Requires
////////////////////////////////////////////////////////////////////////////////
const electron = require('electron');
const { app, BrowserWindow, ipcMain, session, dialog, webContents, shell, crashReporter } =
  electron;
const path = require('path');
const rimraf = require('rimraf');
const remote = require('@electron/remote/main');

// We use a special cache directory for running tests
if (process.env.NAIR_CACHE_DIR) {
  app.setPath('appData', process.env.NAIR_CACHE_DIR);
  app.setPath('userData', path.join(app.getPath('appData'), 'nair-client'));
} else {
  app.setPath('userData', path.join(app.getPath('appData'), pjson.name));
}

if (process.argv.includes('--clearCacheDir')) {
  const rmPath = app.getPath('userData');
  console.log('clear cache directory!: ', rmPath);
  rimraf.sync(rmPath);
}

// 必要なDLLが足りないため、Visual C++ 再頒布可能パッケージを案内するダイアログを表示する

async function showRequiredSystemComponentInstallGuideDialog() {
  const result = await dialog.showMessageBox({
    type: 'error',
    title: `${pjson.buildProductName} の実行に必要なシステムコンポーネントが不足しています`,
    message:
      'Microsoftのウェブサイトから Visual C++ 再頒布可能パッケージ(x64)をインストールしてから再度起動してください。',
    buttons: ['ブラウザでダウンロードする', 'ダウンロードページを開く', '何もせず終了'],
    defaultId: 1,
    cancelId: 2,
    noLink: true,
  });
  switch (result.response) {
    case 0:
      await shell.openExternal('https://aka.ms/vs/17/release/vc_redist.x64.exe');
      break;
    case 1:
      await shell.openExternal(
        'https://support.microsoft.com/ja-jp/help/2977003/the-latest-supported-visual-c-downloads',
      );
      break;
    case 2:
      break;
  }
  app.exit(0);
}

async function recollectUserSessionCookie() {
  // electron14->15でcookieがつかない
  // 設定されるcookieのSameSite指定がないため unspecified となり
  // 設定が無いためchromeがcookieをつけない(通信ログを見るとフィルタされている)
  // cookieを直せば通るようなのでそのパッチ処理
  console.log('recollectUserSessionCookie');
  try {
    const cookies = await electron.session.defaultSession.cookies.get({
      domain: '.nicovideo.jp',
      name: 'user_session', // 他のキーまでやるとNAIR_UNSTABLE=0で問題があるかもなので一旦必須だけ、状況に応じてで
    });
    if (!cookies || !cookies.length) return;

    for (const cookie of cookies) {
      if (cookie.sameSite === 'no_restriction') {
        console.log(`no-need change cookie ${cookie.name}`);
        continue;
      }

      let d = cookie.domain;
      if (d[0] === '.') d = d.substring(1);

      cookie.url = `https://${d}`; //nicovideo.jp';
      cookie.sameSite = 'no_restriction';
      cookie.httpOnly = true;
      cookie.secure = true;

      await electron.session.defaultSession.cookies.set(cookie);
      console.log(`cookie changed ${JSON.stringify(cookie)}`);
    }
  } catch (e) {
    console.log(`cookie error ${e.toString()}`);
  }
}

// This ensures that only one copy of our app can run at once.
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
}

try {
  const crashHandler = require('crash-handler');
  initialize(crashHandler);
} catch (e) {
  console.error('require crash-handler failed: ', e);
  app.on('ready', () => {
    showRequiredSystemComponentInstallGuideDialog();
  });
}

remote.initialize();

function initialize(crashHandler) {
  const fs = require('fs');
  const { Updater } = require('./updater/Updater.js');
  const uuid = require('uuid/v4');
  const windowStateKeeper = require('electron-window-state');
  const { URL } = require('url');

  const pid = require('process').pid;

  app.commandLine.appendSwitch('force-ui-direction', 'ltr');
  process.env.IPC_UUID = `nair-${uuid()}`;

  /* Determine the current release channel we're
   * on based on name. The channel will always be
   * the premajor identifier, if it exists.
   * Otherwise, default to latest. */
  /*
  const releaseChannel = (() => {
    const components = semver.prerelease(pjson.version);

    if (components) return components[0];
    return 'latest';
  })();
  */

  ////////////////////////////////////////////////////////////////////////////////
  // Main Program
  ////////////////////////////////////////////////////////////////////////////////

  // workaround for  https://github.com/electron/electron/issues/19468, https://github.com/electron/electron/issues/19978
  // (Electron 6 to 8 does not launch in Win10 dark mode with DevTool extensions installed)
  rimraf.sync(path.join(app.getPath('userData'), 'DevTools Extensions'));

  const util = require('util');
  const logFile = path.join(app.getPath('userData'), 'app.log');
  const maxLogBytes = 131072;

  // Truncate the log file if it is too long
  if (fs.existsSync(logFile) && fs.statSync(logFile).size > maxLogBytes) {
    const content = fs.readFileSync(logFile);
    fs.writeFileSync(logFile, '[LOG TRUNCATED]\n');
    fs.writeFileSync(logFile, content.slice(content.length - maxLogBytes), { flag: 'a' });
  }

  ipcMain.on('logmsg', (e, msg) => {
    logFromRemote(msg.level, msg.sender, msg.message);
  });

  // eslint-disable-next-line no-inner-declarations
  function logFromRemote(level, sender, msg) {
    msg.split('\n').forEach(line => {
      writeLogLine(`[${new Date().toISOString()}] [${level}] [${sender}] - ${line}`);
    });
  }

  ipcMain.on('get-latest-obs-log', e => {
    const logDir = path.join(app.getPath('userData'), 'node-obs', 'logs');

    // get the latest log file pattern: 'yyyy-mm-dd hh-mm-ss.txt'; sort by name
    const files = fs.readdirSync(logDir);
    if (files.length === 0) {
      e.returnValue = {
        filename: 'no log file found',
        data: null,
      };
      return;
    }

    files.sort();
    const latestFilename = files.pop();
    const latestPathname = path.join(logDir, latestFilename);

    // get file body and return
    const data = fs.readFileSync(latestPathname, 'utf8');
    console.log('Read OBS log file:', latestPathname, data.length, 'bytes');
    e.returnValue = {
      filename: latestFilename,
      data,
    };
  });

  function getFileListRecursive(dir, prefix = '') {
    const files = fs.readdirSync(path.join(dir, prefix));
    return files.flatMap(file => {
      const pathname = path.join(dir, prefix, file);
      const stat = fs.statSync(pathname);
      if (stat.isDirectory()) {
        return getFileListRecursive(dir, path.join(prefix, file));
      } else {
        return [path.join(prefix, file)];
      }
    });
  }

  ipcMain.on('get-obs-plugin-files-list', e => {
    const pluginDir = path.join(
      app.getAppPath().replace('app.asar', 'app.asar.unpacked'),
      'node_modules',
      'obs-studio-node',
      'obs-plugins',
      '64bit',
    );
    console.log('get-obs-plugin-files-list:', pluginDir);

    const files = getFileListRecursive(pluginDir);
    e.returnValue = { path: pluginDir, files };
  });

  const consoleLog = console.log;
  console.log = (...args) => {
    if (!process.env.NAIR_DISABLE_MAIN_LOGGING) {
      const serialized = args
        .map(arg => {
          if (typeof arg === 'string') return arg;

          return util.inspect(arg);
        })
        .join(' ');

      logFromRemote('info', 'electron-main', serialized);
    }
  };

  const lineBuffer = [];

  // eslint-disable-next-line no-inner-declarations
  function writeLogLine(line) {
    // Also print to stdout
    consoleLog(line);

    lineBuffer.push(`${line}\n`);
    flushNextLine();
  }

  let writeInProgress = false;

  // eslint-disable-next-line no-inner-declarations
  function flushNextLine() {
    if (lineBuffer.length === 0) return;
    if (writeInProgress) return;

    const nextLine = lineBuffer.shift();

    writeInProgress = true;

    fs.writeFile(logFile, nextLine, { flag: 'a' }, e => {
      writeInProgress = false;

      if (e) {
        consoleLog('Error writing to log file', e);
        return;
      }

      flushNextLine();
    });
  }

  const os = require('os');
  const cpus = os.cpus();

  ipcMain.on('get-cpu-model', e => {
    e.returnValue = cpus[0].model;
  });

  // Source: https://stackoverflow.com/questions/10420352/converting-file-size-in-bytes-to-human-readable-string/10420404
  // eslint-disable-next-line no-inner-declarations
  function humanFileSize(bytes, si) {
    const thresh = si ? 1000 : 1024;
    if (Math.abs(bytes) < thresh) {
      return bytes + ' B';
    }
    const units = si
      ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
      : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
    let u = -1;
    do {
      bytes /= thresh;
      ++u;
    } while (Math.abs(bytes) >= thresh && u < units.length - 1);
    return bytes.toFixed(1) + ' ' + units[u];
  }

  console.log('=================================');
  console.log('N Air');
  console.log(`Version: ${process.env.NAIR_VERSION}`);
  console.log(`OS: ${os.platform()} ${os.release()}`);
  console.log(`Arch: ${process.arch}`);
  console.log(`CPU: ${cpus[0].model}`);
  console.log(`Cores: ${cpus.length}`);
  console.log(`Memory: ${humanFileSize(os.totalmem(), false)}`);
  console.log(`Free: ${humanFileSize(os.freemem(), false)}`);
  console.log('=================================');

  app.on('ready', () => {
    // network logging is disabled by default
    if (!process.argv.includes('--network-logging')) return;

    // ignore fs requests
    const filter = { urls: ['https://*', 'http://*'] };

    session.defaultSession.webRequest.onBeforeRequest(filter, (details, callback) => {
      console.log('HTTP REQUEST', details.method, details.url);
      callback(details);
    });

    session.defaultSession.webRequest.onErrorOccurred(filter, details => {
      console.log('HTTP REQUEST FAILED', details.method, details.url);
    });

    session.defaultSession.webRequest.onCompleted(filter, details => {
      console.log('HTTP REQUEST COMPLETED', details.method, details.url, details.statusCode);
    });
  });

  // Windows
  let mainWindow;
  let childWindow;

  // Somewhat annoyingly, this is needed so that the child window
  // can differentiate between a user closing it vs the app
  // closing the windows before exit.
  let allowMainWindowClose = false;
  let shutdownStarted = false;
  let appShutdownTimeout;

  global.indexUrl = process.env.DEV_SERVER || `file://${__dirname}/index.html`;

  // eslint-disable-next-line no-inner-declarations
  function openDevTools() {
    if (childWindow.isVisible()) {
      childWindow.webContents.openDevTools({ mode: 'undocked' });
    }
    mainWindow.webContents.openDevTools({ mode: 'undocked' });
  }

  const SentryElectron = require('@sentry/electron/main');

  function handleFinishedReport() {
    // 先にsentryへの送信flushを開始する
    const flush = SentryElectron.flush(3000).catch(error => {
      console.error(error);
    });

    dialog.showErrorBox(
      '予期せぬエラー',
      '予期しないエラーが発生したため、アプリケーションをシャットダウンします。ご不便をおかけして申し訳ありません。\n' +
        'この件に関する情報はデバッグ目的で送信されました。不具合を解決するためにご協力いただきありがとうございます。',
    );

    // ダイアログが閉じたら終了
    flush.finally(() => {
      app.exit();
    });
  }

  if (pjson.env === 'production' || process.env.NAIR_REPORT_TO_SENTRY) {
    const params = process.env.NAIR_UNSTABLE
      ? { organization: 'o170115', project: '1546758', key: '7451aaa71b7640a69ee1d31d6fd9ef78' }
      : { organization: 'o170115', project: '1246812', key: '35a02d8ebec14fd3aadc9d95894fabcf' };

    process.on('uncaughtException', error => {
      console.log('uncaughtException', error);
      handleFinishedReport();
    });

    const sentryDsn = `https://${params.key}@${params.organization}.ingest.sentry.io/${params.project}`;
    const sentryMiniDumpURL = `https://${params.organization}.ingest.sentry.io/api/${params.project}/minidump/?sentry_key=${params.key}`;

    console.log(`Sentry DSN: ${sentryDsn}`);
    SentryElectron.init({
      dsn: sentryDsn,
      release: process.env.NAIR_VERSION,
    });

    crashReporter.start({
      productName: 'n-air-app',
      companyName: 'n-air-app',
      submitURL: sentryMiniDumpURL,
      extra: {
        version: process.env.NAIR_VERSION,
        processType: 'main',
      },
    });
  }

  // eslint-disable-next-line no-inner-declarations
  async function startApp() {
    await recollectUserSessionCookie();
    const isDevMode = process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test';
    let crashHandlerLogPath = '';
    if (process.env.NODE_ENV !== 'production' || !!process.env.SLOBS_PREVIEW) {
      crashHandlerLogPath = app.getPath('userData');
    }

    crashHandler.startCrashHandler(
      app.getAppPath(),
      process.env.NAIR_VERSION,
      isDevMode.toString(),
      crashHandlerLogPath,
      process.IPC_UUID,
    );
    crashHandler.registerProcess(pid, false);

    const mainWindowState = windowStateKeeper({
      defaultWidth: 1600,
      defaultHeight: 1000,
    });

    const mainWindowIsVisible = electron.screen
      .getAllDisplays()
      .some(
        display =>
          display.workArea.x < mainWindowState.x + mainWindowState.width &&
          mainWindowState.x < display.workArea.x + display.workArea.width &&
          display.workArea.y < mainWindowState.y &&
          mainWindowState.y < display.workArea.y + display.workArea.height,
      );

    mainWindow = new BrowserWindow({
      minWidth: 448,
      minHeight: 600,
      width: mainWindowState.width,
      height: mainWindowState.height,
      show: false,
      frame: false,
      title: process.env.NAIR_PRODUCT_NAME,
      ...(mainWindowIsVisible
        ? {
            x: mainWindowState.x,
            y: mainWindowState.y,
          }
        : {}),
      webPreferences: {
        nodeIntegration: true,
        webviewTag: true,
        contextIsolation: false,
      },
    });

    remote.enable(mainWindow.webContents);

    mainWindowState.manage(mainWindow);

    mainWindow.removeMenu();

    // wait until devtools will be opened and load app into window
    // it allows to start application with clean cache
    // and handle breakpoints on startup
    const LOAD_DELAY = 2000;
    setTimeout(
      () => {
        if (process.env.NAIR_PRODUCTION_DEBUG || process.env.DEV_SERVER) openDevTools();
        mainWindow.loadURL(`${global.indexUrl}?windowId=main`);
      },
      isDevMode ? LOAD_DELAY : 0,
    );

    mainWindow.on('close', e => {
      if (!shutdownStarted) {
        shutdownStarted = true;
        childWindow.destroy();
        mainWindow.send('shutdown');

        // We give the main window 10 seconds to acknowledge a request
        // to shut down.  Otherwise, we just close it.
        appShutdownTimeout = setTimeout(() => {
          allowMainWindowClose = true;
          if (!mainWindow.isDestroyed()) mainWindow.close();
        }, 10 * 1000);
      }

      if (!allowMainWindowClose) e.preventDefault();
    });

    ipcMain.on('acknowledgeShutdown', () => {
      if (appShutdownTimeout) clearTimeout(appShutdownTimeout);
    });

    ipcMain.on('shutdownComplete', () => {
      allowMainWindowClose = true;
      mainWindow.close();
    });

    // Initialize the keylistener
    try {
      require('node-libuiohook').startHook();
    } catch (e) {
      console.error('Exception while loading node-libuiohook', e);
      await showRequiredSystemComponentInstallGuideDialog();
      app.exit();
    }

    mainWindow.on('closed', () => {
      require('node-libuiohook').stopHook();
      session.defaultSession.flushStorageData();
      session.defaultSession.cookies.flushStore(() => app.quit());
    });

    // Pre-initialize the child window
    childWindow = new BrowserWindow({
      parent: mainWindow,
      minimizable: false,
      show: false,
      frame: false,
      backgroundColor: '#17242D', // これいる?
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
      },
    });

    remote.enable(childWindow.webContents);

    childWindow.removeMenu();

    // The child window is never closed, it just hides in the
    // background until it is needed.
    childWindow.on('close', e => {
      if (!shutdownStarted) {
        childWindow.send('closeWindow');

        // Prevent the window from actually closing
        e.preventDefault();
      }
    });

    if (isDevMode || process.env.NAIR_PRODUCTION_DEBUG) {
      console.log('installing vue devtools extension...');
      const { default: installExtension, VUEJS_DEVTOOLS } = require('electron-devtools-installer');
      installExtension(VUEJS_DEVTOOLS)
        .then(name => console.log(name))
        .catch(err => console.log(err));
    }

    // if (process.env.NAIR_PRODUCTION_DEBUG || process.env.DEV_SERVER) openDevTools();

    // simple messaging system for services between windows
    // WARNING! the child window use synchronous requests and will be frozen
    // until main window asynchronous response
    const requests = {};

    function sendRequest(request, event = null) {
      mainWindow.webContents.send('services-request', request);
      if (!event) return;
      requests[request.id] = Object.assign({}, request, { event });
    }

    // use this function to call some service method from the main process
    function callService(resource, method, ...args) {
      sendRequest({
        jsonrpc: '2.0',
        method,
        params: {
          resource,
          args,
        },
      });
    }

    ipcMain.on('services-ready', () => {
      if (!childWindow.isDestroyed()) {
        childWindow.loadURL(`${global.indexUrl}?windowId=child`);
      }
    });

    ipcMain.on('services-request', (event, payload) => {
      sendRequest(payload, event);
    });

    ipcMain.on('services-response', (event, response) => {
      if (!requests[response.id]) return;
      requests[response.id].event.returnValue = response;
      delete requests[response.id];
    });

    ipcMain.on('services-message', (event, payload) => {
      const windows = BrowserWindow.getAllWindows();
      windows.forEach(window => {
        if (window.id === mainWindow.id || window.isDestroyed()) return;
        window.webContents.send('services-message', payload);
      });
    });

    if (isDevMode) {
      // require('devtron').install();
      // Vue dev tools appears to cause strange non-deterministic
      // interference with certain NodeJS APIs, especially asynchronous
      // IO from the renderer process.  Enable at your own risk.
      // const devtoolsInstaller = require('electron-devtools-installer');
      // devtoolsInstaller.default(devtoolsInstaller.VUEJS_DEVTOOLS);
      // setTimeout(() => {
      //   openDevTools();
      // }, 10 * 1000);
    }
  }

  const haDisableFile = path.join(app.getPath('userData'), 'HADisable');
  if (fs.existsSync(haDisableFile)) app.disableHardwareAcceleration();

  app.setAsDefaultProtocolClient('n-air-app');

  app.on('second-instance', (event, argv, cwd) => {
    // Check for protocol links in the argv of the other process
    argv.forEach(arg => {
      if (arg.match(/^n-air-app:\/\//)) {
        mainWindow.send('protocolLink', arg);
      }
    });

    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }

      mainWindow.focus();
    }
  });

  app.on('ready', () => {
    if (process.env.NODE_ENV === 'production' || process.env.NAIR_FORCE_AUTO_UPDATE) {
      new Updater(startApp).run();
    } else {
      startApp();
    }
  });

  ipcMain.on('openDevTools', () => {
    openDevTools();
  });

  ipcMain.on('window-showChildWindow', (event, windowOptions) => {
    if (windowOptions.size.width && windowOptions.size.height) {
      // Center the child window on the main window

      // For some unknown reason, electron sometimes gets into a
      // weird state where this will always fail.  Instead, we
      // should recover by simply setting the size and forgetting
      // about the bounds.
      try {
        const bounds = mainWindow.getBounds();
        const childX = bounds.x + bounds.width / 2 - windowOptions.size.width / 2;
        const childY = bounds.y + bounds.height / 2 - windowOptions.size.height / 2;

        childWindow.show();
        childWindow.restore();
        childWindow.setMinimumSize(windowOptions.size.width, windowOptions.size.height);

        if (windowOptions.center) {
          childWindow.setBounds({
            x: Math.floor(childX),
            y: Math.floor(childY),
            width: windowOptions.size.width,
            height: windowOptions.size.height,
          });
        }
      } catch (err) {
        console.log('Recovering from error:', err);

        childWindow.setMinimumSize(windowOptions.size.width, windowOptions.size.height);
        childWindow.setSize(windowOptions.size.width, windowOptions.size.height);
        childWindow.center();
      }

      childWindow.focus();
    }
  });

  ipcMain.on('window-closeChildWindow', event => {
    // never close the child window, hide it instead
    childWindow.hide();
  });

  ipcMain.on('window-focusMain', () => {
    mainWindow.focus();
  });

  // eslint-disable-next-line no-inner-declarations
  function preventClose(e) {
    if (!shutdownStarted) {
      e.preventDefault();
    }
  }

  ipcMain.on('window-preventClose', (event, id) => {
    const window = BrowserWindow.fromId(id);
    window.addListener('close', preventClose);
  });

  ipcMain.on('window-allowClose', (event, id) => {
    const window = BrowserWindow.fromId(id);
    window.removeListener('close', preventClose);
  });

  /**
   * 番組作成・編集画面からログアウトを封じる処理
   * rendererプロセスからは遷移前に止められないのでここに実装がある
   * @see https://github.com/electron/electron/pull/11679#issuecomment-359180722
   **/
  // eslint-disable-next-line no-inner-declarations
  function preventLogout(e, url) {
    const urlObj = new URL(url);
    const isLogout =
      /^https?:$/.test(urlObj.protocol) &&
      /^live2?\.nicovideo\.jp$/.test(urlObj.hostname) &&
      /^\/logout$/.test(urlObj.pathname);
    if (isLogout) {
      e.preventDefault();
    }
  }

  ipcMain.on('window-preventLogout', (event, id) => {
    const window = BrowserWindow.fromId(id);
    window.webContents.on('will-navigate', preventLogout);
  });

  /**
   * 新ウィンドウ表示は既定のブラウザで開かせる処理
   * rendererプロセスからは処理を止められないのでここに実装がある
   * @see https://github.com/electron/electron/pull/11679#issuecomment-359180722
   **/
  // eslint-disable-next-line no-inner-declarations
  function preventNewWindow(e, url) {
    e.preventDefault();
    shell.openExternal(url);
  }

  ipcMain.on('window-preventNewWindow', (_event, id) => {
    const window = BrowserWindow.fromId(id);
    window.webContents.on('new-window', preventNewWindow);
  });

  // The main process acts as a hub for various windows
  // syncing their vuex stores.
  const registeredStores = {};

  ipcMain.on('vuex-register', event => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const windowId = win.id;

    // Register can be received multiple times if the window is
    // refreshed.  We only want to register it once.
    if (!registeredStores[windowId]) {
      registeredStores[windowId] = win;
      console.log('Registered vuex stores: ', Object.keys(registeredStores));

      // Make sure we unregister is when it is closed
      win.on('closed', () => {
        delete registeredStores[windowId];
        console.log('Registered vuex stores: ', Object.keys(registeredStores));
      });
    }

    if (windowId !== mainWindow.id) {
      // Tell the mainWindow to send its current store state
      // to the newly registered window

      mainWindow.webContents.send('vuex-sendState', windowId);
    }
  });

  // Proxy vuex-mutation events to all other subscribed windows
  ipcMain.on('vuex-mutation', (event, mutation) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);

    if (senderWindow && !senderWindow.isDestroyed()) {
      const windowId = senderWindow.id;

      Object.keys(registeredStores)
        .filter(id => id !== windowId.toString())
        .forEach(id => {
          const win = registeredStores[id];
          if (!win.isDestroyed()) win.webContents.send('vuex-mutation', mutation);
        });
    }
  });

  ipcMain.on('restartApp', () => {
    // prevent unexpected cache clear
    const args = process.argv.slice(1).filter(x => x !== '--clearCacheDir');

    app.relaunch({ args });
    // Closing the main window starts the shut down sequence
    mainWindow.close();
  });

  /* The following 2 methods need to live in the main process
     because events bound using the remote module are not
     executed synchronously and therefore default actions
     cannot be prevented. */
  ipcMain.on('webContents-preventNavigation', (e, id) => {
    webContents.fromId(id).on('will-navigate', e => {
      e.preventDefault();
    });
  });

  ipcMain.on('webContents-preventPopup', (e, id) => {
    webContents.fromId(id).on('new-window', e => {
      e.preventDefault();
    });
  });

  ipcMain.on('getMainWindowWebContentsId', e => {
    e.returnValue = mainWindow.webContents.id;
  });

  ipcMain.on('requestPerformanceStats', e => {
    const stats = app.getAppMetrics();
    e.sender.send('performanceStatsResponse', stats);
  });

  ipcMain.on('showErrorAlert', () => {
    if (!mainWindow.isDestroyed()) {
      // main window may be destroyed on shutdown
      mainWindow.send('showErrorAlert');
    }
  });

  ipcMain.on('webContents-enableRemote', (e, id) => {
    const contents = webContents.fromId(id);
    if (contents.isDestroyed()) return;
    remote.enable(contents);
    e.returnValue = null;
  });

  ipcMain.on('mainwindow-operation', (e, key, a, b) => {
    e.returnValue = mainWindow[key](a, b);
  });

  ipcMain.handle('recollectUserSessionCookie', async () => {
    await recollectUserSessionCookie();
  });
}
