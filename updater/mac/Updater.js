// This is the entry point to the auto-updater, and should
// be required by the main electron process.

const { autoUpdater } = require('electron-updater');
const { app, BrowserWindow, ipcMain, dialog } = require('electron');

class Updater {
  // startApp is a callback that will start the app.  Ideally this
  // would have been done with a promise, but electron tries to quit
  // when the last window is closed, so the hand-off has to be
  // synchronous.  Otherwise, electron will quit as soon as we close
  // the auto updater.  Pre-initializing the mainWindow is now a
  // good option either, since then closing the auto updater will
  // orphan the main process in the background.
  constructor(startApp, channel) {
    this.startApp = startApp;
    if (process.arch === 'arm64') {
      this.channel = 'arm64-' + channel;
    } else {
      this.channel = channel;
    }
  }

  run() {
    const osVersion = require('os').release();
    // Darwin 21 == macOS 12 (Monterey), the minimum supported by Electron 38+.
    // Anything below this cannot launch the app, so refuse the update rather than
    // let the user install a build their OS will not run.
    if (osVersion && Number(osVersion.substring(0, 2)) < 21) {
      dialog.showMessageBoxSync({
        message:
          'Streamlabs Desktop requires macOS 12 (Monterey) or later. Your version of macOS is no longer supported, so this update cannot be installed.',
        type: 'error',
      });
      app.exit();
      return;
    }

    this.updateState = {};

    this.bindListeners();

    // Redirect to new channel for Streamlabs Desktop
    autoUpdater.channel = `desktop-${this.channel}`;

    autoUpdater.checkForUpdates().catch(() => {
      // This usually means there is no internet connection.
      // In this case, we shouldn't prevent starting the app.
      this.startApp();
      this.finished = true;
      if (this.browserWindow) this.browserWindow.close();
    });
  }

  // PRIVATE

  bindListeners() {
    autoUpdater.on('update-available', info => {
      console.log('Updater: Update available', info);
      this.browserWindow = this.initWindow();
      this.updateState.version = info.version;
      this.updateState.percent = 0;
      this.pushState();
    });

    autoUpdater.on('update-not-available', () => {
      console.log('Updater: Update not found');
      this.startApp();
      this.finished = true;
      if (this.browserWindow) this.browserWindow.close();
    });

    autoUpdater.on('download-progress', progress => {
      console.log('Updater: Download progress', progress);
      this.updateState.percent = progress.percent;

      if (progress.percent === 100) {
        this.updateState.installing = true;
      }

      this.pushState();
    });

    autoUpdater.on('update-downloaded', () => {
      console.log('Updater: Update successfully downloaded');
      this.updateState.installing = true;
      this.pushState();
      autoUpdater.quitAndInstall();
    });

    autoUpdater.on('error', error => {
      console.log('Updater: Error', error);
      this.updateState.error = true;
      this.pushState();
    });

    ipcMain.on('autoUpdate-getState', () => {
      this.pushState();
    });
  }

  initWindow() {
    const browserWindow = new BrowserWindow({
      width: 400,
      height: 180,
      frame: false,
      resizable: false,
      show: false,
      webPreferences: { nodeIntegration: true, enableRemoteModule: true, contextIsolation: false },
      backgroundColor: '#17242d',
    });

    browserWindow.on('ready-to-show', () => {
      browserWindow.show();
    });

    browserWindow.on('closed', () => {
      // Prevent leaving a zombie process
      if (!this.finished) app.quit();
    });

    browserWindow.loadURL('file://' + __dirname + '/index.html');

    return browserWindow;
  }

  pushState() {
    if (this.browserWindow && !this.browserWindow.isDestroyed()) {
      this.browserWindow.webContents.send('autoUpdate-pushState', this.updateState);
    }
  }
}

exports.Updater = Updater;
