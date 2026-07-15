import test from 'ava';
import * as path from 'path';

const SHUTDOWN_COORDINATOR_PATH = 'app/util/shutdown-coordinator.js';

test('electron-builder packages the main-process shutdown coordinator', t => {
  const projectRoot = path.resolve(__dirname, '../../..');
  const configPath = path.join(projectRoot, 'electron-builder/base.config.js');
  const config = require(configPath) as { files?: unknown[] };
  const files = Array.isArray(config.files) ? config.files : [];

  t.true(
    files.includes(SHUTDOWN_COORDINATOR_PATH),
    `${SHUTDOWN_COORDINATOR_PATH} must be included in the packaged application`,
  );
});
