import test from 'ava';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { createExclusiveWriteStream } from '../../../app/util/safe-file';

/**
 * Regression tests for HackerOne #3335683: overlay export followed symlinks and
 * NTFS junctions, letting a lower-privileged user redirect the write onto a
 * file they could not otherwise touch.
 */

const isWin = process.platform === 'win32';

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'safe-file-test'));
}

/** Removes the tree without ever recursing through a link. */
function cleanup(root: string, links: string[] = []) {
  links.forEach(link => {
    try {
      fs.rmdirSync(link);
    } catch (e) {
      try {
        fs.unlinkSync(link);
      } catch (e2) {
        /* already gone */
      }
    }
  });
  fs.rmSync(root, { recursive: true, force: true });
}

function write(target: string, data: string) {
  return new Promise<void>((resolve, reject) => {
    const stream = createExclusiveWriteStream(target);
    stream.on('error', reject);
    stream.on('close', () => resolve());
    stream.end(data);
  });
}

/**
 * Points `link` at `target` using whatever reparse/link primitive the platform
 * offers without elevation. On Windows that is a directory junction, which is
 * what the reported exploit uses.
 */
function linkTo(link: string, target: string) {
  if (isWin) {
    execFileSync('cmd', ['/c', 'mklink', '/J', link, target], { stdio: 'ignore' });
  } else {
    fs.symlinkSync(target, link);
  }
}

test('writes a new file', async t => {
  const root = makeRoot();
  try {
    const target = path.join(root, 'new.overlay');
    await write(target, 'hello');

    t.is(fs.readFileSync(target, 'utf8'), 'hello');
    t.true(fs.lstatSync(target).isFile());
  } finally {
    cleanup(root);
  }
});

test('overwrites an existing regular file', async t => {
  const root = makeRoot();
  try {
    const target = path.join(root, 'existing.overlay');
    fs.writeFileSync(target, 'stale placeholder');
    await write(target, 'fresh');

    t.is(fs.readFileSync(target, 'utf8'), 'fresh');
  } finally {
    cleanup(root);
  }
});

test('refuses to write through a link and leaves the victim untouched', async t => {
  const root = makeRoot();
  const link = path.join(root, 'base.overlay');
  try {
    const victimDir = path.join(root, 'victim');
    const victimFile = path.join(victimDir, 'poc.txt');
    fs.mkdirSync(victimDir);
    fs.writeFileSync(victimFile, 'DO NOT OVERWRITE');

    linkTo(link, isWin ? victimDir : victimFile);

    const err = t.throws(() => createExclusiveWriteStream(link));
    t.regex(err.message, /not a regular file/);
    t.is(fs.readFileSync(victimFile, 'utf8'), 'DO NOT OVERWRITE');

    // The link itself must survive: deleting it would be a surprise of its own.
    // lstat reports a Windows junction as a symlink, same as a POSIX one.
    t.true(fs.lstatSync(link).isSymbolicLink());
  } finally {
    cleanup(root, [link]);
  }
});

test('writes normally once the link is removed', async t => {
  const root = makeRoot();
  const link = path.join(root, 'base.overlay');
  try {
    const victimDir = path.join(root, 'victim');
    const victimFile = path.join(victimDir, 'poc.txt');
    fs.mkdirSync(victimDir);
    fs.writeFileSync(victimFile, 'DO NOT OVERWRITE');

    linkTo(link, isWin ? victimDir : victimFile);
    if (isWin) fs.rmdirSync(link);
    else fs.unlinkSync(link);

    await write(link, 'now a real file');

    t.is(fs.readFileSync(link, 'utf8'), 'now a real file');
    t.true(fs.lstatSync(link).isFile());
    t.is(fs.readFileSync(victimFile, 'utf8'), 'DO NOT OVERWRITE');
  } finally {
    cleanup(root, [link]);
  }
});

test('refuses a directory', async t => {
  const root = makeRoot();
  try {
    const target = path.join(root, 'dir.overlay');
    fs.mkdirSync(target);

    const err = t.throws(() => createExclusiveWriteStream(target));
    t.regex(err.message, /not a regular file/);
  } finally {
    cleanup(root);
  }
});

test('refuses a read-only file rather than clearing the flag', async t => {
  const root = makeRoot();
  const target = path.join(root, 'readonly.overlay');
  try {
    fs.writeFileSync(target, 'protected');
    fs.chmodSync(target, 0o444);

    // Deleting would silently drop the read-only attribute, so this must refuse
    // exactly as a plain open would have.
    const err = t.throws(() => createExclusiveWriteStream(target));
    t.regex(err.message, /read-only/);
    t.is(fs.readFileSync(target, 'utf8'), 'protected');
  } finally {
    fs.chmodSync(target, 0o666);
    cleanup(root);
  }
});

test('does not leak descriptors when it refuses', async t => {
  const root = makeRoot();
  try {
    const target = path.join(root, 'dir.overlay');
    fs.mkdirSync(target);

    for (let i = 0; i < 500; i++) {
      t.throws(() => createExclusiveWriteStream(target));
    }

    // A leak here would surface as EMFILE long before the loop ended.
    await write(path.join(root, 'still-works.overlay'), 'ok');
    t.pass();
  } finally {
    cleanup(root);
  }
});
