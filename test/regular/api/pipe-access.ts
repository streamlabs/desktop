import { execFileSync } from 'child_process';
import * as path from 'path';
import { useWebdriver, test } from '../../helpers/webdriver';
import { getApiClient } from '../../helpers/api-client';
import { ScenesService } from 'services/api/external-api/scenes';

useWebdriver({ restartAppAfterEachTest: false });

// The API named pipe is Windows-only (macOS uses a Unix socket)
const windowsTest = process.platform === 'win32' ? test : test.skip;

const PIPE_PATH = '\\\\.\\pipe\\slobs';

// Full path so a Unix whoami on PATH (e.g. Git Bash) isn't picked up instead
const WHOAMI = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'whoami.exe');

function getCurrentUserSid(): string {
  // e.g. "machine\user","S-1-5-21-..."
  const output = execFileSync(WHOAMI, ['/user', '/fo', 'csv', '/nh']).toString();
  return output.trim().split(',')[1].replace(/"/g, '');
}

windowsTest('API named pipe is restricted to the current user', async t => {
  // The owner can still connect and use the API
  const api = await getApiClient();
  const scenesService = api.getResource<ScenesService>('ScenesService');
  t.true(scenesService.getScenes().length > 0);

  // Node creates the pipe with a DACL that also grants read access to Everyone (WD)
  // and Anonymous (AN). TcpServerService must replace it with a protected DACL
  // granting access only to the current user and SYSTEM.
  const { getPipeDacl } = require('node-secure-pipe');
  t.is(getPipeDacl(PIPE_PATH), `D:P(A;;FA;;;${getCurrentUserSid()})(A;;FA;;;SY)`);
});
