import * as fs from 'fs';
import * as path from 'path';
import { importExtractZip } from './slow-imports';

const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;

interface IZipEntry {
  fileName: string;
  externalFileAttributes: number;
}

type ExtractZip = (
  zipPath: string,
  opts: { dir: string; onEntry?: (entry: IZipEntry) => void },
) => Promise<void>;

async function loadExtractZip(): Promise<ExtractZip> {
  const mod = await importExtractZip();
  // no default export when compiled without esModuleInterop (unit tests)
  return mod.default ?? ((mod as unknown) as ExtractZip);
}

function isSymlinkEntry(entry: IZipEntry) {
  return ((entry.externalFileAttributes >> 16) & S_IFMT) === S_IFLNK;
}

function isInside(dir: string, target: string) {
  const relative = path.relative(dir, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function isSymlink(file: string) {
  try {
    return fs.lstatSync(file).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Extracts an archive that must not contain any symlinks
 */
export async function extractZipNoSymlinks(zipPath: string, dir: string) {
  const extractZip = await loadExtractZip();

  await extractZip(zipPath, {
    dir,
    onEntry: entry => {
      if (isSymlinkEntry(entry)) {
        throw new Error(`Symlink entry "${entry.fileName}" is not allowed in archive`);
      }
    },
  });
}

/**
 * Extracts an archive, keeping only symlinks whose target stays inside `dir`
 */
export async function extractZipInternalSymlinks(zipPath: string, dir: string) {
  const extractZip = await loadExtractZip();
  const root = path.resolve(dir);
  const symlinks: string[] = [];

  try {
    await extractZip(zipPath, {
      dir,
      onEntry: entry => {
        const dest = path.join(root, entry.fileName);

        // never write through a link created earlier in the archive
        if (isSymlink(dest)) {
          throw new Error(`Entry "${entry.fileName}" overwrites a symlink`);
        }

        if (isSymlinkEntry(entry)) symlinks.push(dest);
      },
    });

    // link targets are only readable after extraction
    const realRoot = fs.realpathSync.native(root);
    for (const link of symlinks) {
      // native realpath resolves the chain as the OS does; unresolvable links throw
      const realTarget = fs.realpathSync.native(link);

      if (!isInside(realRoot, realTarget)) {
        throw new Error(`Symlink "${path.relative(root, link)}" points outside of archive`);
      }
    }
  } catch (e: unknown) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw e;
  }
}
