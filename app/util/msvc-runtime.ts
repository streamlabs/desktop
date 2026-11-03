import fs from 'fs';
import path from 'path';

export interface IMsvcRuntimeInfo {
  /** Full path of the loaded msvcp140.dll, or 'not loaded'. */
  path: string;
  /** File version such as '14.44.35211.0', or 'unknown'. */
  version: string;
}

/**
 * Finds the msvcp140.dll loaded in this process, and its file version.
 *
 * obs-studio-node crashes at startup in mtx_do_lock when the process loads an
 * msvcp140.dll older than 14.40. The path shows where that copy came from: an
 * old System32 copy, a DLL injected by another program, or a leftover copy in
 * the app folder.
 *
 * Windows only. Call it after obs-studio-node is loaded, because Electron
 * itself does not load msvcp140.dll.
 */
export function getMsvcRuntimeInfo(): IMsvcRuntimeInfo {
  const dllPath = findLoadedModule('msvcp140.dll');
  if (!dllPath) return { path: 'not loaded', version: 'unknown' };

  return { path: dllPath, version: readFileVersion(dllPath) ?? 'unknown' };
}

function findLoadedModule(fileName: string): string | undefined {
  // Node's diagnostic report lists the full path of every DLL loaded in the process.
  const report = process.report.getReport() as any;
  const sharedObjects: string[] = (typeof report === 'string' ? JSON.parse(report) : report)
    .sharedObjects;

  return sharedObjects.find(p => path.win32.basename(p).toLowerCase() === fileName);
}

// Reads the file version from the DLL's VS_FIXEDFILEINFO resource. The struct starts
// with the signature 0xFEEF04BD and the struct version 0x00010000, followed by the
// file version as two 32-bit values: (major << 16 | minor) and (build << 16 | revision).
function readFileVersion(dllPath: string): string | undefined {
  const data = fs.readFileSync(dllPath);
  const signature = Buffer.from([0xbd, 0x04, 0xef, 0xfe]);

  for (let i = data.indexOf(signature); i >= 0; i = data.indexOf(signature, i + 1)) {
    if (i + 16 > data.length) break;
    if (data.readUInt32LE(i + 4) !== 0x00010000) continue;

    const ms = data.readUInt32LE(i + 8);
    const ls = data.readUInt32LE(i + 12);
    return [ms >>> 16, ms & 0xffff, ls >>> 16, ls & 0xffff].join('.');
  }

  return undefined;
}
