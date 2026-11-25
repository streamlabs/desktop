import test from 'ava';
import { testBelongsToChunk } from '../helpers/test-sharding';

function assignedChunks(name: string, timings: Record<string, number>) {
  return [1, 2, 3, 4].filter(chunk => testBelongsToChunk(name, timings, `${chunk}/4`));
}

test('CI sharding assigns unmeasured tests to exactly one runner', t => {
  for (const name of ['YouTube Dual Stream', 'new test', 'new test 2', '']) {
    const chunks = assignedChunks(name, {});
    t.is(chunks.length, 1);
    t.deepEqual(assignedChunks(name, { unrelated: 100 }), chunks);
  }
});

test('CI sharding uses each measured test start, including the final test', t => {
  const timings = { first: 10, second: 10, third: 10, last: 10 };
  t.deepEqual(assignedChunks('first', timings), [1]);
  t.deepEqual(assignedChunks('second', timings), [2]);
  t.deepEqual(assignedChunks('third', timings), [3]);
  t.deepEqual(assignedChunks('last', timings), [4]);
});

test('Local tests run without a CI chunk', t => {
  t.true(testBelongsToChunk('measured', { measured: 10 }));
  t.true(testBelongsToChunk('unmeasured', {}));
});

test('CI sharding rejects an invalid chunk instead of silently losing tests', t => {
  for (const chunk of ['0/4', '5/4', '1/0', '1.5/4', 'invalid']) {
    t.throws(() => testBelongsToChunk('test', {}, chunk), {
      message: `Invalid SLOBS_TEST_RUN_CHUNK: ${chunk}`,
    });
  }
});
