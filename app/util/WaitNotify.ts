export class WaitNotify {
  private _promise: Promise<void> | null = null;
  private _resolve: (() => void) | null = null;
  wait(): Promise<void> {
    if (!this._promise) {
      this._promise = new Promise(resolve => {
        this._resolve = resolve;
      });
    }
    return this._promise;
  }
  notify() {
    if (this._resolve) {
      this._resolve();
      this._promise = null;
      this._resolve = null;
    }
  }
}
