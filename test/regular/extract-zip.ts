import test from 'ava';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import archiver = require('archiver');
import { extractZipInternalSymlinks, extractZipNoSymlinks } from '../../app/util/extract-zip';

interface IEntry {
  name: string;
  content?: string;
  linkname?: string;
}

// symlink entries are zip metadata only, so no OS symlink privilege is needed
async function makeZip(zipPath: string, entries: IEntry[]) {
  const output = fs.createWriteStream(zipPath);
  const archive = archiver('zip', { store: true });
  const closed = new Promise<void>((resolve, reject) => {
    output.on('close', () => resolve());
    archive.on('error', reject);
  });
  archive.pipe(output);
  for (const entry of entries) {
    if (entry.linkname !== undefined) {
      archive.symlink(entry.name, entry.linkname);
    } else {
      archive.append(entry.content ?? '', { name: entry.name });
    }
  }
  archive.finalize();
  await closed;
}

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'extract-zip-test-'));
  return {
    zipPath: path.join(root, 'test.zip'),
    outDir: path.join(root, 'out', 'target'),
    outside: path.join(root, 'outside.txt'),
    root,
  };
}

test('overlay zip extracts normally', async t => {
  const { zipPath, outDir, root } = setup();
  await makeZip(zipPath, [
    { name: 'config.json', content: '{}' },
    { name: 'images/a.png', content: 'png' },
  ]);

  await extractZipNoSymlinks(zipPath, outDir);

  t.is(fs.readFileSync(path.join(outDir, 'config.json'), 'utf8'), '{}');
  t.is(fs.readFileSync(path.join(outDir, 'images', 'a.png'), 'utf8'), 'png');
  fs.rmSync(root, { recursive: true, force: true });
});

test('overlay zip with a symlink entry is rejected and nothing escapes', async t => {
  const { zipPath, outDir, outside, root } = setup();
  fs.writeFileSync(outside, 'original');
  await makeZip(zipPath, [
    { name: 'link', linkname: outside },
    { name: 'link', content: 'overwritten' },
  ]);

  await t.throwsAsync(extractZipNoSymlinks(zipPath, outDir), { message: /Symlink entry "link"/ });

  t.is(fs.readFileSync(outside, 'utf8'), 'original');
  t.false(fs.existsSync(path.join(outDir, 'link')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('overlay zip with a relative internal symlink is still rejected', async t => {
  const { zipPath, outDir, root } = setup();
  await makeZip(zipPath, [
    { name: 'a.txt', content: 'a' },
    { name: 'b.txt', linkname: 'a.txt' },
  ]);

  await t.throwsAsync(extractZipNoSymlinks(zipPath, outDir), { message: /Symlink entry "b.txt"/ });
  fs.rmSync(root, { recursive: true, force: true });
});

test('zip-slip entry is rejected', async t => {
  const { zipPath, outDir, root } = setup();
  // archiver normalizes "../" away, so patch the name in after writing
  await makeZip(zipPath, [{ name: 'AA/AA/evil.txt', content: 'evil' }]);
  const patched = fs
    .readFileSync(zipPath)
    .toString('latin1')
    .split('AA/AA/evil.txt')
    .join('../../evil.txt');
  fs.writeFileSync(zipPath, patched, 'latin1');

  await t.throwsAsync(extractZipNoSymlinks(zipPath, outDir), { message: /invalid relative path/ });

  t.false(fs.existsSync(path.join(root, 'evil.txt')));
  t.false(fs.existsSync(path.join(root, 'out', 'evil.txt')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('vision zip with an internal symlink extracts', async t => {
  if (process.platform === 'win32') {
    // creating a symlink on Windows needs Developer Mode or elevation
    try {
      const probe = setup();
      fs.symlinkSync('x', path.join(probe.root, 'probe'));
      fs.rmSync(probe.root, { recursive: true, force: true });
    } catch {
      t.pass('symlink creation unavailable on this machine');
      return;
    }
  }

  const { zipPath, outDir, root } = setup();
  await makeZip(zipPath, [
    { name: 'Frameworks/Lib.framework/Versions/A/lib', content: 'lib' },
    { name: 'Frameworks/Lib.framework/Versions/Current', linkname: 'A' },
    { name: 'Frameworks/Lib.framework/lib', linkname: 'Versions/Current/lib' },
  ]);

  await extractZipInternalSymlinks(zipPath, outDir);

  t.is(fs.readFileSync(path.join(outDir, 'Frameworks/Lib.framework/lib'), 'utf8'), 'lib');
  fs.rmSync(root, { recursive: true, force: true });
});

test('vision zip with an escaping symlink is rejected and cleaned up', async t => {
  if (process.platform === 'win32') {
    try {
      const probe = setup();
      fs.symlinkSync('x', path.join(probe.root, 'probe'));
      fs.rmSync(probe.root, { recursive: true, force: true });
    } catch {
      t.pass('symlink creation unavailable on this machine');
      return;
    }
  }

  const { zipPath, outDir, outside, root } = setup();
  fs.writeFileSync(outside, 'original');
  await makeZip(zipPath, [
    { name: 'link', linkname: '../../outside.txt' },
    { name: 'link', content: 'overwritten' },
  ]);

  await t.throwsAsync(extractZipInternalSymlinks(zipPath, outDir));

  t.is(fs.readFileSync(outside, 'utf8'), 'original');
  t.false(fs.existsSync(outDir));
  fs.rmSync(root, { recursive: true, force: true });
});
