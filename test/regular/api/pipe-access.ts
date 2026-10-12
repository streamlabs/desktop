import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { useWebdriver, test } from '../../helpers/webdriver';
import { getApiClient, getSocketPath } from '../../helpers/api-client';
import { ScenesService } from 'services/api/external-api/scenes';

useWebdriver({ restartAppAfterEachTest: false });

// The API named pipe is Windows-only (macOS uses a Unix socket)
const windowsTest = process.platform === 'win32' ? test : test.skip;
const macTest = process.platform === 'darwin' ? test : test.skip;

const PIPE_PATH = '\\\\.\\pipe\\slobs';

// Full paths so Unix tools on PATH (e.g. Git Bash's whoami) aren't picked up instead
const SYSTEM32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
const WHOAMI = path.join(SYSTEM32, 'whoami.exe');
const POWERSHELL = path.join(SYSTEM32, 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const SYSTEM_SID = 'S-1-5-18';

function getCurrentUserSid(): string {
  // e.g. "machine\user","S-1-5-21-..."
  const output = execFileSync(WHOAMI, ['/user', '/fo', 'csv', '/nh']).toString();
  return output.trim().split(',')[1].replace(/"/g, '');
}

// SDDL abbreviates well-known accounts, e.g. SY for SYSTEM and LA for the built-in
// Administrator (RID 500). Resolve every ACE's SID to its full form before comparing.
function normalizeSddl(sddl: string): string {
  const sidTokens = (sddl.match(/;;;[^)]+\)/g) || []).map(token => token.slice(3, -1));
  const aliases = Array.from(new Set(sidTokens)).filter(sid => !sid.startsWith('S-'));
  if (aliases.length === 0) return sddl;
  const script = aliases
    .map(alias => `([Security.Principal.SecurityIdentifier]::new('${alias}')).Value`)
    .join('; ');
  const sids = execFileSync(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', script])
    .toString()
    .trim()
    .split(/\r?\n/);
  return aliases.reduce(
    (result, alias, i) => result.split(`;;;${alias})`).join(`;;;${sids[i]})`),
    sddl,
  );
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
  t.is(
    normalizeSddl(getPipeDacl(PIPE_PATH)),
    `D:P(A;;FA;;;${getCurrentUserSid()})(A;;FA;;;${SYSTEM_SID})`,
  );
});

macTest('API Unix socket is restricted to the current user', async t => {
  // The owner can still connect and use the API
  const api = await getApiClient();
  const scenesService = api.getResource<ScenesService>('ScenesService');
  t.true(scenesService.getScenes().length > 0);

  // TcpServerService must chmod the socket to 0600 so other accounts can't connect
  const stats = fs.statSync(getSocketPath());
  t.true(stats.isSocket());
  t.is(stats.uid, process.getuid());
  t.is(stats.mode & 0o777, 0o600);
});
