// Useful for debugging.
// If you think you need to use this in an actual
// test, you almost definitely don't.

export function sleep(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}
