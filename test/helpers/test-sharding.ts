/** Assign every test to one CI chunk, including tests without recorded timings. */
export function testBelongsToChunk(
  testName: string,
  timings: Record<string, number>,
  chunk?: string,
): boolean {
  if (!chunk) return true;

  const [currentChunk, totalChunks] = chunk.split('/').map(Number);
  if (
    !Number.isInteger(currentChunk) ||
    !Number.isInteger(totalChunks) ||
    currentChunk < 1 ||
    currentChunk > totalChunks
  ) {
    throw new Error(`Invalid SLOBS_TEST_RUN_CHUNK: ${chunk}`);
  }

  if (!timings[testName]) {
    // New tests must not compete for the same pooled accounts on every runner.
    let hash = 0;
    for (const character of testName) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0;
    return (hash % totalChunks) + 1 === currentChunk;
  }

  let startTime = 0;
  let totalTime = 0;
  for (const name of Object.keys(timings)) {
    if (name === testName) startTime = totalTime;
    totalTime += timings[name];
  }

  return Math.floor(startTime / (totalTime / totalChunks)) + 1 === currentChunk;
}
