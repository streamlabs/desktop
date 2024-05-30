import { WaitNotify } from './WaitNotify';

export type StartFunc = () => Promise<{
  cancel: () => Promise<void>;
  running: Promise<void>;
} | null>;
export type PrepareFunc = () => Promise<StartFunc | null>;

export class QueueRunner {
  private queue: {
    prepare: PrepareFunc;
    label: string;
  }[] = [];
  private preparing: {
    preparing: Promise<StartFunc>;
    label: string;
  } | null = null;
  private runningState: {
    cancel: () => Promise<void>;
    running: Promise<void>;
    state: 'preparing' | 'running';
  } | null = null;

  runNext() {
    setTimeout(() => this._run(), 0);
  }
  private finishNotifier = new WaitNotify();
  private logCallback: (obj: { state: string; label: string }) => void;

  constructor(
    options: {
      log?: (obj: { state: string; label: string }) => void;
    } = {},
  ) {
    this.logCallback = options.log || undefined;
  }

  log(state: string, label: string) {
    if (this.logCallback) {
      this.logCallback({ state, label });
    }
  }

  private async _run() {
    if (!this.preparing) {
      const next = this.queue.shift();
      if (next) {
        const { prepare, label } = next;
        const preparing = prepare();
        this.preparing = {
          preparing,
          label,
        };
        preparing.then(start => {
          if (!start) {
            this.preparing = null;
            this.log('prepared null', label);
            this.runNext();
          } else {
            this.log('prepared', label);
            if (!this.runningState) {
              this.runNext();
            }
          }
        });
      } else {
        if (!this.runningState) {
          this.finishNotifier.notify();
        }
      }
    }
    if (!this.runningState && this.preparing) {
      const { preparing, label } = this.preparing;
      this.preparing = null;
      let earlyCancel = false;
      let resolveRunning2: () => void = () => {};
      const running2 = new Promise<void>(resolve => {
        resolveRunning2 = resolve;
      });
      running2.then(() => {
        this.log('finished', label);
        this.runningState = null;
        this.runNext();
      });
      this.runningState = {
        cancel: async () => {
          this.runningState.cancel = async () => {
            await running2;
          };
          earlyCancel = true;
          await running2;
        },
        running: running2,
        state: 'preparing',
      };
      this.log('preparing', label);
      preparing
        .then(start => {
          return start ? start() : null;
        })
        .then(r => {
          if (!r) {
            this.log('not started', label);
            resolveRunning2();
          } else {
            const { cancel, running } = r;
            if (earlyCancel) {
              this.log('early cancel', label);
              cancel().then(() => {
                resolveRunning2();
              });
            } else {
              this.log('running', label);
              this.runningState = {
                cancel: async () => {
                  this.runningState.cancel = async () => {
                    await running2;
                  };
                  await cancel();
                  await running2;
                },
                running: running.then(() => {
                  resolveRunning2();
                }),
                state: 'running',
              };
            }
          }
        });
    }
  }

  async cancelQueue() {
    // 実行中のものはキャンセルしない
    this.queue = [];
    if (this.preparing) {
      this.preparing = null;
    }
  }

  async cancel() {
    // 実行中のものはキャンセルし、キューに残っているものは削除する
    this.cancelQueue();
    if (this.runningState) {
      await this.runningState.cancel();
    }
  }

  get isRunning(): boolean {
    return this.runningState !== null || this.preparing !== null || this.queue.length > 0;
  }

  async waitUntilFinished(): Promise<void> {
    if (!this.isRunning) {
      return;
    }
    return this.finishNotifier.wait();
  }

  /**
   *
   * @param prepare 準備を開始する関数。準備が完了したら、キャンセル関数と実行中のPromiseをobjectで返す。実行を開始しなかったらnullを返す。
   * @param label デバッグ表示用のラベル
   */
  add(prepare: PrepareFunc, label: string) {
    if (prepare) {
      this.queue.push({ prepare, label });
    }
  }

  get state(): 'preparing' | 'running' | null {
    if (this.runningState) {
      return this.runningState.state;
    }
    if (this.preparing) {
      return 'preparing';
    }
    return null;
  }

  get length(): number {
    return this.queue.length + (this.preparing ? 1 : 0);
  }
}
