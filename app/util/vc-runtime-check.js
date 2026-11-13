// Detects an msvcp140.dll that is too old for our native modules.
//
// Binaries built with VS 2022 17.10+ use a constexpr std::mutex constructor, and msvcp140.dll
// older than 14.40 crashes in mtx_do_lock the first time such a mutex is locked. This has to
// be checked in the main process before any window loads, because obs-api requires
// obs_studio_client.node as soon as a window's bundle is evaluated, which would crash the
// renderer before any check in app code could run.

const fs = require('fs');
const path = require('path');

const MIN_MINOR_VERSION = 40;
const DOWNLOAD_URL = 'https://obsproject.com/visual-studio-2022-runtimes';

// VS_FIXEDFILEINFO.dwSignature followed by dwStrucVersion 1.0, little-endian
const FIXED_FILE_INFO_HEADER = Buffer.from([0xbd, 0x04, 0xef, 0xfe, 0x00, 0x00, 0x01, 0x00]);

/**
 * Reads the file version from a PE file's VS_FIXEDFILEINFO resource.
 * @returns {{ major: number, minor: number, build: number, revision: number } | null}
 */
function readFileVersion(filePath) {
  const data = fs.readFileSync(filePath);
  const offset = data.indexOf(FIXED_FILE_INFO_HEADER);
  if (offset === -1 || offset + 16 > data.length) return null;

  const versionMS = data.readUInt32LE(offset + 8);
  const versionLS = data.readUInt32LE(offset + 12);
  return {
    major: versionMS >>> 16,
    minor: versionMS & 0xffff,
    build: versionLS >>> 16,
    revision: versionLS & 0xffff,
  };
}

/**
 * Finds the msvcp140.dll that obs64.exe and obs_studio_client.node will load. obs64.exe searches
 * its own directory first, and Node loads addons with LOAD_WITH_ALTERED_SEARCH_PATH, which
 * searches the addon's directory first. Both live in the obs-studio-node directory, and both
 * fall back to System32.
 */
function findRuntime(osnDir) {
  const candidates = [
    path.join(osnDir, 'msvcp140.dll'),
    path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'msvcp140.dll'),
  ];
  return candidates.find(candidate => fs.existsSync(candidate));
}

/**
 * @param {string} osnDir The obs-studio-node directory, the same one obs64.exe runs from.
 * @returns {{ outdated: boolean, version: string, path?: string }}
 */
function checkVCRuntime(osnDir) {
  const runtimePath = findRuntime(osnDir);
  if (!runtimePath) return { outdated: true, version: 'not found' };

  const version = readFileVersion(runtimePath);
  // An unreadable version resource shouldn't stop the app from starting
  if (!version) return { outdated: false, version: 'unknown', path: runtimePath };

  return {
    outdated: version.major === 14 && version.minor < MIN_MINOR_VERSION,
    version: `${version.major}.${version.minor}.${version.build}.${version.revision}`,
    path: runtimePath,
  };
}

module.exports = { checkVCRuntime, readFileVersion, DOWNLOAD_URL };
