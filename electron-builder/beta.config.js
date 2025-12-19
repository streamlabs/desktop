const base = require('./base.config');

base.win.extraFiles.push({
  from: 'electron-builder/force-local-bundles',
  to: 'force-local-bundles',
});
base.win.executableName = 'Streamlabs OBS for Beta';

module.exports = base;
