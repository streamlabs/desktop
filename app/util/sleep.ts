export function sleep(timeout: number): Promise<void> {
  return new Promise(done => {
    setTimeout(done, timeout);
  });
}
