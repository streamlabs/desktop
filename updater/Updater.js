// This is the entry point to the auto-updater, and should
// be required by the main electron process.

const { autoUpdater } = require('electron-updater');
const { app, BrowserWindow, ipcMain } = require('electron');
const semver = require('semver');
const path = require('path');
const electron = require('electron');

class Updater {
  // startApp is a callback that will start the app.  Ideally this
  // would have been done with a promise, but electron tries to quit
  // when the last window is closed, so the hand-off has to be
  // synchronous.  Otherwise, electron will quit as soon as we close
  // the auto updater.  Pre-initializing the mainWindow is now a
  // good option either, since then closing the auto updater will
  // orphan the main process in the background.
  constructor(startApp) {
    this.startApp = startApp;
  }

  run() {
    this.updateState = {};
    this.cancellationToken = undefined;

    this.bindListeners();

    this.browserWindow = this.initWindow();

    autoUpdater.autoDownload = false;

    autoUpdater.checkForUpdates().catch(() => {
      // This usually means there is no internet connection.
      // In this case, we shouldn't prevent starting the app.
      this.skipUpdateAndContinue();
    });
  }

  async skipUpdateAndContinue() {
    // Closing the only window would normally quit the app, so ensure it doesn't.
    electron.app.once('will-quit', e => e.preventDefault());
    this.finished = true;
    this.browserWindow.close();
    await this.startApp();
  }

  // PRIVATE

  isUnskippableUpdate(currentVersion, newVersion) {
    const currentVer = semver.parse(currentVersion);
    const newVer = semver.parse(newVersion);
    if (!currentVer || !newVer) {
      return true;
    }
    if (currentVer.major !== newVer.major) {
      return true;
    }
    if (currentVer.minor !== newVer.minor) {
      return true;
    }
    return false;
  }

  textToLines(text) {
    return text.split('\n');
  }

  bindListeners() {
    autoUpdater.on('update-available', info => {
      this.updateState.asking = true;
      this.updateState.releaseNotes = this.textToLines(info.releaseNotes);
      this.updateState.releaseDate = info.releaseDate;
      this.updateState.fileSize = info.files[0].size;
      this.updateState.version = info.version;
      this.updateState.percent = 0;
      this.updateState.isUnskippable = this.isUnskippableUpdate(
        process.env.NAIR_VERSION,
        info.version,
      );
      console.log(`oldVersion: ${process.env.NAIR_VERSION}
newVersion: ${info.version}
isUnskippable: ${this.updateState.isUnskippable}`);
      this.cancellationToken = info.cancellationToken;
      this.pushState();
    });

    ipcMain.on('autoUpdate-startDownload', () => {
      this.updateState.asking = false;
      autoUpdater.downloadUpdate(this.cancellationToken);
      this.pushState();
    });

    autoUpdater.on('update-not-available', () => {
      this.skipUpdateAndContinue();
    });

    autoUpdater.on('download-progress', progress => {
      this.updateState.percent = progress.percent;
      this.updateState.bytesPerSecond = progress.percent;

      if (progress.percent === 100) {
        this.updateState.installing = true;
      }

      this.pushState();
    });

    ipcMain.on('autoUpdate-cancelDownload', () => {
      if (this.cancellationToken) {
        this.cancellationToken.cancel();
        this.cancellationToken = null;
      }
      this.finished = true;
      this.skipUpdateAndContinue();
    });

    autoUpdater.on('update-downloaded', () => {
      this.updateState.installing = true;
      this.pushState();
      autoUpdater.quitAndInstall();
    });

    autoUpdater.on('error', () => {
      this.updateState.error = true;
      this.pushState();
    });

    ipcMain.on('autoUpdate-getState', () => {
      this.pushState();
    });
  }

  initWindow() {
    const browserWindow = new BrowserWindow({
      width: 596,
      height: 369,
      webPreferences: {
        nodeIntegration: true,
        enableRemoteModule: true,
        contextIsolation: false,
      },
      useContentSize: true,
      title: `${process.env.NAIR_PRODUCT_NAME} - Ver: ${process.env.NAIR_VERSION}`,
      frame: true,
      closable: true,
      resizable: false,
      show: false,
    });

    require('@electron/remote/main').enable(browserWindow.webContents);

    browserWindow.setMenuBarVisibility(false);

    browserWindow.on('ready-to-show', () => {
      browserWindow.show();
    });

    browserWindow.on('closed', () => {
      // Prevent leaving a zombie process
      if (this.cancellationToken) {
        this.cancellationToken.cancel();
        this.cancellationToken = null;
      }
      if (!this.finished) app.quit();
    });

    if (process.env.NODE_ENV !== 'production') {
      browserWindow.webContents.openDevTools({ mode: 'undocked' });
    }

    browserWindow.loadURL('file://' + path.join(__dirname, 'index.html'));

    return browserWindow;
  }

  pushState() {
    if (!this.browserWindow.isDestroyed()) {
      this.browserWindow.send('autoUpdate-pushState', this.updateState);
    }
  }
}

exports.Updater = Updater;
