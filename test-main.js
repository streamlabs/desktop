// Electron main process for TESTS ONLY
// This should never be used outside of tests.

if (process.env.NODE_ENV !== 'test') {
  throw new Error('Cannot run test-main.js outside of tests!');
}

const path = require('path');
const electron = require('electron');

// Inject fake context menu
(() => {
  let currentMenu;

  electron.Menu.prototype.popup = function popup() {
    currentMenu = this;
  };

  function getItem(menu, label) {
    const found = menu.items.find(item => {
      return item.label.indexOf(label) !== -1;
    });

    return found.submenu ?? found;
  }

  electron.ipcMain.on('__WEBDRIVER_FAKE_CONTEXT_MENU', (e, label) => {
    if (typeof label === 'string') {
      getItem(currentMenu, label).click();
    } else if (Array.isArray(label)) {
      let current = currentMenu;
      const path = [...label];

      while (path.length > 0) {
        current = getItem(current, path.shift());
      }

      current.click();
    }
  });
})();

// Inject fake dialog
(() => {
  let currentCb;
  let currentButtons;

  electron.dialog.showMessageBox = function showMessageBox(win, opts) {
    return new Promise(resolve => {
      currentCb = resolve;

      // Support alternate function signature where win is omitted
      if (win.buttons) {
        currentButtons = win.buttons;
      } else {
        currentButtons = opts.buttons;
      }
    });
  };

  electron.ipcMain.on('__WEBDRIVER_FAKE_MESSAGE_BOX', (e, buttonLabel) => {
    currentButtons.forEach((button, index) => {
      if (button === buttonLabel) currentCb({ response: index });
    });
  });
})();

(() => {
  let currentCb;

  electron.dialog.showSaveDialog = function showSaveDialog(win, opts) {
    return new Promise(resolve => {
      currentCb = resolve;
    });
  };

  electron.ipcMain.on('__WEBDRIVER_FAKE_SAVE_DIALOG', (e, filePath) => {
    currentCb({ filePath });
  });
})();

// Run the real application main process
require(path.join(__dirname, 'main.js'));
