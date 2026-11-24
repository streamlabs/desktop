import test from 'ava';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { checkVCRuntime, readFileVersion } from '../../app/util/vc-runtime-check';

// VS_FIXEDFILEINFO.dwSignature followed by dwStrucVersion 1.0, little-endian
const FIXED_FILE_INFO_HEADER = Buffer.from([0xbd, 0x04, 0xef, 0xfe, 0x00, 0x00, 0x01, 0x00]);

type Version = [number, number, number, number];

/**
 * Builds a minimal stand-in for a PE file: arbitrary leading bytes, then a VS_FIXEDFILEINFO
 * header and its dwFileVersionMS/dwFileVersionLS fields, then trailing bytes, the way the
 * structure sits inside a real DLL's resource section.
 */
function buildVersionedBinary([major, minor, build, revision]: Version) {
  const version = Buffer.alloc(8);
  version.writeUInt32LE(((major << 16) | minor) >>> 0, 0);
  version.writeUInt32LE(((build << 16) | revision) >>> 0, 4);
  return Buffer.concat([
    Buffer.from('MZ'),
    Buffer.alloc(509, 0x11),
    FIXED_FILE_INFO_HEADER,
    version,
    Buffer.alloc(64, 0x22),
  ]);
}

/** A file with no VS_FIXEDFILEINFO resource at all */
const UNVERSIONED_BINARY = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(1024, 0x11)]);

/** A file whose VS_FIXEDFILEINFO header is cut off before the version fields end */
const TRUNCATED_BINARY = Buffer.concat([
  Buffer.from('MZ'),
  Buffer.alloc(64, 0x11),
  FIXED_FILE_INFO_HEADER,
  Buffer.alloc(4),
]);

let fixtureRoot: string;

test.before(() => {
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'slobs-vc-runtime-'));
});

test.after.always(() => {
  if (fixtureRoot) fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

/**
 * Creates an isolated obs-studio-node directory and Windows directory. Passing contents for
 * either location writes an msvcp140.dll there; omitting it leaves that location empty.
 */
function createFixture(name: string, files: { appLocal?: Buffer; system32?: Buffer } = {}) {
  const dir = path.join(fixtureRoot, name);
  const osnDir = path.join(dir, 'obs-studio-node');
  const systemRoot = path.join(dir, 'Windows');
  const system32 = path.join(systemRoot, 'System32');
  fs.mkdirSync(osnDir, { recursive: true });
  fs.mkdirSync(system32, { recursive: true });

  const appLocalPath = path.join(osnDir, 'msvcp140.dll');
  const system32Path = path.join(system32, 'msvcp140.dll');
  if (files.appLocal) fs.writeFileSync(appLocalPath, files.appLocal);
  if (files.system32) fs.writeFileSync(system32Path, files.system32);

  return { osnDir, systemRoot, appLocalPath, system32Path };
}

test('readFileVersion extracts all four version parts', t => {
  const { system32Path } = createFixture('extract', {
    system32: buildVersionedBinary([14, 42, 34433, 1]),
  });

  t.deepEqual(readFileVersion(system32Path), {
    major: 14,
    minor: 42,
    build: 34433,
    revision: 1,
  });
});

test('readFileVersion handles version parts with the high bit set', t => {
  const { system32Path } = createFixture('extract-high-bit', {
    system32: buildVersionedBinary([0xffff, 0x8000, 0xfffe, 0x8001]),
  });

  t.deepEqual(readFileVersion(system32Path), {
    major: 0xffff,
    minor: 0x8000,
    build: 0xfffe,
    revision: 0x8001,
  });
});

test('readFileVersion returns null when there is no version resource', t => {
  const { system32Path } = createFixture('extract-missing', { system32: UNVERSIONED_BINARY });
  t.is(readFileVersion(system32Path), null);
});

test('readFileVersion returns null when the version resource is truncated', t => {
  const { system32Path } = createFixture('extract-truncated', { system32: TRUNCATED_BINARY });
  t.is(readFileVersion(system32Path), null);
});

test('A 14.39 runtime is outdated', t => {
  const { osnDir, systemRoot, system32Path } = createFixture('boundary-14-39', {
    system32: buildVersionedBinary([14, 39, 33523, 0]),
  });

  t.deepEqual(checkVCRuntime(osnDir, { SystemRoot: systemRoot }), {
    outdated: true,
    version: '14.39.33523.0',
    path: system32Path,
  });
});

test('A 14.40 runtime is current', t => {
  const { osnDir, systemRoot, system32Path } = createFixture('boundary-14-40', {
    system32: buildVersionedBinary([14, 40, 33810, 0]),
  });

  t.deepEqual(checkVCRuntime(osnDir, { SystemRoot: systemRoot }), {
    outdated: false,
    version: '14.40.33810.0',
    path: system32Path,
  });
});

test('A runtime from a later major version is not treated as outdated', t => {
  const { osnDir, systemRoot } = createFixture('major-15', {
    system32: buildVersionedBinary([15, 0, 0, 0]),
  });

  t.false(checkVCRuntime(osnDir, { SystemRoot: systemRoot }).outdated);
});

test('An application-local current runtime takes precedence over an outdated System32 one', t => {
  const { osnDir, systemRoot, appLocalPath } = createFixture('precedence-local-current', {
    appLocal: buildVersionedBinary([14, 44, 35211, 0]),
    system32: buildVersionedBinary([14, 29, 30133, 0]),
  });

  t.deepEqual(checkVCRuntime(osnDir, { SystemRoot: systemRoot }), {
    outdated: false,
    version: '14.44.35211.0',
    path: appLocalPath,
  });
});

test('An application-local outdated runtime takes precedence over a current System32 one', t => {
  const { osnDir, systemRoot, appLocalPath } = createFixture('precedence-local-outdated', {
    appLocal: buildVersionedBinary([14, 36, 32532, 0]),
    system32: buildVersionedBinary([14, 44, 35211, 0]),
  });

  t.deepEqual(checkVCRuntime(osnDir, { SystemRoot: systemRoot }), {
    outdated: true,
    version: '14.36.32532.0',
    path: appLocalPath,
  });
});

test('System32 is located through windir when SystemRoot is not set', t => {
  const { osnDir, systemRoot, system32Path } = createFixture('windir', {
    system32: buildVersionedBinary([14, 39, 33523, 0]),
  });

  const result = checkVCRuntime(osnDir, { windir: systemRoot });
  t.true(result.outdated);
  t.is(result.path, system32Path);
});

test('A missing runtime is reported when System32 could be searched', t => {
  const { osnDir, systemRoot } = createFixture('missing');

  t.deepEqual(checkVCRuntime(osnDir, { SystemRoot: systemRoot }), {
    outdated: true,
    version: 'not found',
  });
});

test('A missing runtime does not block startup when System32 cannot be located', t => {
  const { osnDir } = createFixture('missing-no-system-root');

  t.deepEqual(checkVCRuntime(osnDir, {}), {
    outdated: false,
    version: 'unknown',
  });
});

test('An application-local runtime is still checked when System32 cannot be located', t => {
  const { osnDir, appLocalPath } = createFixture('local-no-system-root', {
    appLocal: buildVersionedBinary([14, 39, 33523, 0]),
  });

  t.deepEqual(checkVCRuntime(osnDir, {}), {
    outdated: true,
    version: '14.39.33523.0',
    path: appLocalPath,
  });
});

test('A runtime without a version resource does not block startup', t => {
  const { osnDir, systemRoot, system32Path } = createFixture('unversioned', {
    system32: UNVERSIONED_BINARY,
  });

  t.deepEqual(checkVCRuntime(osnDir, { SystemRoot: systemRoot }), {
    outdated: false,
    version: 'unknown',
    path: system32Path,
  });
});

test('A runtime with a truncated version resource does not block startup', t => {
  const { osnDir, systemRoot, system32Path } = createFixture('truncated', {
    system32: TRUNCATED_BINARY,
  });

  t.deepEqual(checkVCRuntime(osnDir, { SystemRoot: systemRoot }), {
    outdated: false,
    version: 'unknown',
    path: system32Path,
  });
});

test('An unversioned application-local runtime is used instead of falling back to System32', t => {
  const { osnDir, systemRoot, appLocalPath } = createFixture('unversioned-local', {
    appLocal: UNVERSIONED_BINARY,
    system32: buildVersionedBinary([14, 29, 30133, 0]),
  });

  t.deepEqual(checkVCRuntime(osnDir, { SystemRoot: systemRoot }), {
    outdated: false,
    version: 'unknown',
    path: appLocalPath,
  });
});

test('Detects the version in the real System32 runtime when present', t => {
  const systemRoot = process.env.SystemRoot || process.env.windir;
  const realRuntime = systemRoot && path.join(systemRoot, 'System32', 'msvcp140.dll');
  if (process.platform !== 'win32' || !realRuntime || !fs.existsSync(realRuntime)) {
    t.pass('No System32 msvcp140.dll on this machine');
    return;
  }

  const version = readFileVersion(realRuntime);
  t.truthy(version, 'Expected a version resource in the real msvcp140.dll');
  t.is(version.major, 14);
});
