if (process.platform !== 'win32') {
  module.exports = {};
} else {
  module.exports = require('./build/Release/secure_pipe.node');
}
