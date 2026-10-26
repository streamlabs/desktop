import test from 'ava';
import { readFileSync } from 'fs';
import { runInNewContext } from 'vm';

const parseArguments = require('yargs-parser');
const runnerSource = readFileSync('test/helpers/runner.js', 'utf8');
const timingsPath = 'test-dist/test-timings.json';
const failuresPath = 'test-dist/failed-tests.json';

async function runFixture(options: {
  args?: string[];
  prepared?: boolean;
  snapshot?: unknown;
  failedTests?: string[];
}) {
  const files = new Map<string, string>();
  if (options.snapshot !== undefined) files.set(timingsPath, JSON.stringify(options.snapshot));
  const commands: string[] = [];
  const retried: string[] = [];
  const requests: string[] = [];
  const exitCodes: number[] = [];
  const failedTests = options.failedTests || [];
  const remoteTimings = [{ name: 'changed remote test', time: 500 }];
  const context = {
    console: { log() {}, error() {} },
    process: {
      argv: ['node', 'test/helpers/runner.js', ...(options.args || [])],
      env: {
        BUILD_BUILDID: 'runner-regression',
        SLOBS_TEST_TIMINGS_PREPARED: options.prepared ? '1' : undefined,
      },
      exit(code: number) {
        exitCodes.push(code);
        throw new Error('Fixture process exited');
      },
    },
    require(name: string) {
      if (name === 'fs') {
        return {
          existsSync: (file: string) => files.has(file),
          mkdirSync() {},
          readFileSync(file: string) {
            if (!files.has(file)) throw new Error(`Missing fixture file: ${file}`);
            return files.get(file);
          },
          writeFileSync: (file: string, contents: string) => files.set(file, contents),
        };
      }
      if (name === 'rimraf') return { sync: (file: string) => files.delete(file) };
      if (name === 'https') return { Agent: class {} };
      if (name === 'node-fetch') {
        return async (url: string) => {
          requests.push(url);
          return { ok: true, json: async () => remoteTimings };
        };
      }
      if (name === 'child_process') {
        return {
          execSync(command: string) {
            commands.push(command);
            if (commands.length === 1 && failedTests.length) {
              files.set(failuresPath, JSON.stringify(failedTests));
              throw new Error('Initial test run failed');
            }
            if (commands.length > 1) {
              const parsed = parseArguments(command, {
                array: ['match'],
                string: ['match'],
                boolean: ['v', 'color'],
              });
              const matches: string[] = parsed.match || [];
              retried.push(
                ...[...failedTests, 'already passing test'].filter(
                  title => !matches.length || matches.includes(title),
                ),
              );
            }
            files.set(failuresPath, '[]');
          },
        };
      }
      throw new Error(`Unexpected runner dependency: ${name}`);
    },
  };
  try {
    await runInNewContext(runnerSource, context, { filename: 'test/helpers/runner.js' });
  } catch (error) {
    if (!exitCodes.length) throw error;
  }
  await new Promise(resolve => setImmediate(resolve));
  return { files, commands, retried, requests, exitCodes, remoteTimings };
}

test('CI retries execute the first failed title as well as later titles', async t => {
  const titles = ['first failed test', 'second failed test'];
  const result = await runFixture({ failedTests: titles });
  t.deepEqual(result.retried, titles);
  t.deepEqual(result.exitCodes, []);
});

test('A single CI retry does not rerun already passing tests', async t => {
  const titles = ['only failed test'];
  const result = await runFixture({ failedTests: titles });
  t.deepEqual(result.retried, titles);
});

test('Preparing the shared timing snapshot does not execute tests', async t => {
  const result = await runFixture({ args: ['--prepare-timings'] });
  t.deepEqual(result.commands, []);
  t.deepEqual(JSON.parse(result.files.get(timingsPath)!), result.remoteTimings);
  t.is(result.requests.length, 1);
});

test('CI batches reuse their packaged timing snapshot instead of refetching', async t => {
  const snapshot = [{ name: 'original test', time: 10 }];
  const result = await runFixture({ prepared: true, snapshot });
  t.deepEqual(JSON.parse(result.files.get(timingsPath)!), snapshot);
  t.false(result.requests.some(url => url.endsWith('/testStats')));
  t.is(result.commands.length, 1);
});

test('A missing packaged timing snapshot stops a CI batch before tests', async t => {
  const result = await runFixture({ prepared: true });
  t.deepEqual(result.commands, []);
  t.deepEqual(result.exitCodes, [1]);
  t.false(result.requests.some(url => url.endsWith('/testStats')));
});

test('Invalid packaged timings stop CI instead of silently dropping tests', async t => {
  for (const snapshot of [{}, [{ name: 'test', time: 'invalid' }], [{ name: 'test', time: -1 }]]) {
    const result = await runFixture({ prepared: true, snapshot });
    t.deepEqual(result.commands, []);
    t.deepEqual(result.exitCodes, [1]);
    t.false(result.requests.some(url => url.endsWith('/testStats')));
  }
});
