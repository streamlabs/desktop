import test from 'ava';
import { FileManagerService } from '../../app/services/file-manager';

interface ITestFile {
  data: string;
  locked: boolean;
  version: number;
  dirty: boolean;
  flushWaiters?: Array<{
    resolve: () => void;
    reject: (error: unknown) => void;
  }>;
}

interface IPendingWrite {
  filePath: string;
  data: string;
  resolve: () => void;
  reject: (error: unknown) => void;
}

const fileManagerPrototype = FileManagerService.prototype as any;

function createFile(data = 'data'): ITestFile {
  return { data, locked: false, version: 0, dirty: true };
}

function createControlledService(files: Dictionary<ITestFile>) {
  const pendingWrites: IPendingWrite[] = [];
  const service = {
    files,
    flush: fileManagerPrototype.flush,
    waitForFlush: fileManagerPrototype.waitForFlush,
    notifyFlushFinished: fileManagerPrototype.notifyFlushFinished,
    writeFile(filePath: string, data: string) {
      return new Promise<void>((resolve, reject) => {
        pendingWrites.push({ filePath, data, resolve, reject });
      });
    },
  };

  return { service, pendingWrites };
}

async function waitUntil(predicate: () => boolean) {
  for (let attempt = 0; attempt < 20 && !predicate(); attempt += 1) {
    await Promise.resolve();
  }
}

test('concurrent flushAll calls wait for the same in-flight write', async t => {
  const file = createFile();
  const { service, pendingWrites } = createControlledService({ file });

  const firstFlush = fileManagerPrototype.flushAll.call(service) as Promise<void>;
  const secondFlush = fileManagerPrototype.flushAll.call(service) as Promise<void>;

  t.is(pendingWrites.length, 1);
  t.is(file.flushWaiters!.length, 2);

  pendingWrites[0].resolve();
  await Promise.all([firstFlush, secondFlush]);

  t.false(file.dirty);
  t.false(file.locked);
  t.is(file.flushWaiters!.length, 0);
});

test('flushAll waits for rewrites and new files that race an in-flight flush', async t => {
  const firstFile = createFile('first-v1');
  const { service, pendingWrites } = createControlledService({ first: firstFile });
  let settled = false;

  const flushAll = (fileManagerPrototype.flushAll.call(service) as Promise<void>).then(() => {
    settled = true;
  });

  t.deepEqual(
    pendingWrites.map(write => [write.filePath, write.data]),
    [['first', 'first-v1']],
  );

  firstFile.data = 'first-v2';
  firstFile.version += 1;
  firstFile.dirty = true;
  service.flush('first');

  const secondFile = createFile('second-v1');
  service.files.second = secondFile;
  service.flush('second');

  pendingWrites[0].resolve();
  await waitUntil(() => pendingWrites.length === 3);

  t.deepEqual(
    pendingWrites.map(write => [write.filePath, write.data]),
    [
      ['first', 'first-v1'],
      ['second', 'second-v1'],
      ['first', 'first-v2'],
    ],
  );
  t.false(settled);

  pendingWrites[2].resolve();
  await waitUntil(() => secondFile.flushWaiters?.length === 1);
  t.false(settled);

  pendingWrites[1].resolve();
  await flushAll;

  t.true(settled);
  t.false(firstFile.dirty);
  t.false(secondFile.dirty);
});

test('flushAll rejects after write retries are exhausted', async t => {
  const file = createFile();
  let attempts = 0;
  const service = {
    files: { file },
    flush: fileManagerPrototype.flush,
    waitForFlush: fileManagerPrototype.waitForFlush,
    notifyFlushFinished: fileManagerPrototype.notifyFlushFinished,
    async writeFile() {
      attempts += 1;
      throw new Error('disk full');
    },
  };

  await t.throwsAsync(fileManagerPrototype.flushAll.call(service), {
    message: /Failed to flush 1 file\(s\): file/,
  });

  t.is(attempts, 11);
  t.true(file.dirty);
  t.false(file.locked);
  t.is(file.flushWaiters!.length, 0);
});
