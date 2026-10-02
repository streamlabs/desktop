// Helper methods for writing files that other users may be able to tamper with
// Namespace import so this module also loads outside the webpack bundle, which
// is what supplies default-import interop for node builtins.
import * as fs from 'fs';

/**
 * Opens `filePath` for writing without following a symlink or NTFS junction
 * planted at that path by another user.
 *
 * Writing to a user-chosen path in a shared folder is a link-following hazard:
 * a lower-privileged user can swap the target for a reparse point and redirect
 * our write onto a file they could not otherwise touch. See HackerOne #3335683.
 *
 * Only the final path component is checked. Parent directories are left alone
 * because Windows folder redirection (OneDrive, redirected Documents) uses
 * junctions legitimately.
 *
 * @param filePath the file to create, replacing it if it already exists
 */
export function createExclusiveWriteStream(filePath: string): fs.WriteStream {
  const existing = fs.lstatSync(filePath, { throwIfNoEntry: false });

  if (existing) {
    if (!existing.isFile()) {
      throw new Error(`Refusing to write ${filePath}: not a regular file`);
    }

    // Deleting below would clear the Windows read-only attribute as a side
    // effect, so check it first and keep refusing what a plain open refused.
    if (!(existing.mode & 0o200)) {
      throw new Error(`Refusing to write ${filePath}: file is read-only`);
    }

    // unlink never follows the final component, so this removes a link rather
    // than its target if one is swapped in after the check above.
    fs.unlinkSync(filePath);
  }

  // 'wx' is O_CREAT | O_EXCL, which maps to CREATE_NEW on Windows and fails
  // outright if anything reappears at the path, so we never open an object
  // that already existed.
  const fd = fs.openSync(filePath, 'wx');

  try {
    const opened = fs.fstatSync(fd, { bigint: true });
    const onDisk = fs.lstatSync(filePath, { bigint: true });

    // A reparse point at the path resolves to a different file than the handle
    // we just created, which is the only way the exclusive create above can
    // still have landed somewhere unintended.
    if (opened.ino !== onDisk.ino || opened.dev !== onDisk.dev) {
      throw new Error(`Refusing to write ${filePath}: path was redirected`);
    }
  } catch (e: unknown) {
    fs.closeSync(fd);
    throw e;
  }

  // Hand over the descriptor rather than the path: reopening by path would
  // reintroduce the window the checks above just closed.
  return fs.createWriteStream('', { fd });
}
