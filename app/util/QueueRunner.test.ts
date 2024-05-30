import { sleep } from 'util/sleep';
import { QueueRunner, StartFunc } from './QueueRunner';

class Task {
  completePrepare: (skip: boolean) => void;
  completeRun: () => void;
  prepare: () => Promise<StartFunc | null>;
  state: 'idle' | 'preparing' | 'running' | 'completed' | 'canceled' = 'idle';

  constructor(startCallback: (task: Task) => void = undefined) {
    const prepare = new Promise<boolean>(resolve => {
      this.completePrepare = skip => {
        resolve(skip);
      };
    });
    const run = new Promise<void>(resolve => {
      this.completeRun = () => {
        resolve();
        this.state = 'completed';
      };
    });
    this.prepare = async () => async () => {
      this.state = 'preparing';
      if (startCallback) {
        startCallback(this);
      }
      return prepare.then(skip => {
        if (skip) {
          return null;
        } else {
          this.state = 'running';
          return {
            cancel: async () => {
              this.completeRun();
              await run;
              this.state = 'canceled';
            },
            running: run,
          };
        }
      });
    };
  }
}

describe('QueueRunner', () => {
  test('empty', async () => {
    const queue = new QueueRunner();
    expect(queue.length).toBe(0);
    expect(queue.state).toBe(null);
    expect(queue.isRunning).toBe(false);
  });

  test('normal lifecycle', async () => {
    const queue = new QueueRunner();
    const task = new Task();

    queue.add(task.prepare, 'one');
    expect(queue.length).toBe(1);
    expect(queue.state).toBe(null);
    expect(queue.isRunning).toBe(true);
    queue.runNext();
    await sleep(0);
    expect(queue.length).toBe(0);
    expect(queue.state).toBe('preparing');
    expect(queue.isRunning).toBe(true);
    task.completePrepare(false);
    await sleep(0);
    expect(queue.length).toBe(0);
    expect(queue.state).toBe('running');
    expect(queue.isRunning).toBe(true);
    task.completeRun();
    await queue.waitUntilFinished();
    expect(queue.length).toBe(0);
    expect(queue.state).toBe(null);
    expect(queue.isRunning).toBe(false);
  });

  test('normal skip', async () => {
    const queue = new QueueRunner();
    const task = new Task();

    queue.add(task.prepare, 'one');
    expect(queue.length).toBe(1);
    expect(queue.state).toBe(null);
    expect(queue.isRunning).toBe(true);
    queue.runNext();
    await sleep(0);
    expect(queue.length).toBe(0);
    expect(queue.state).toBe('preparing');
    expect(queue.isRunning).toBe(true);
    task.completePrepare(true);
    await queue.waitUntilFinished();
    expect(queue.length).toBe(0);
    expect(queue.state).toBe(null);
    expect(queue.isRunning).toBe(false);
  });

  test('early cancel', async () => {
    const queue = new QueueRunner();
    const task = new Task();
    queue.add(task.prepare, 'one');
    expect(queue.length).toBe(1);
    queue.cancel();
    await queue.waitUntilFinished();
    expect(task.state).toBe('idle');
    expect(queue.length).toBe(0);
    expect(queue.state).toBe(null);
    expect(queue.isRunning).toBe(false);
  });

  test('cancel while preparing', async () => {
    const queue = new QueueRunner();
    const task = new Task();
    queue.add(task.prepare, 'one');
    queue.runNext();
    await sleep(0);
    expect(task.state).toBe('preparing');
    queue.cancel();
    task.completePrepare(false);
    await queue.waitUntilFinished();
    expect(task.state).toBe('canceled');
    expect(queue.length).toBe(0);
    expect(queue.state).toBe(null);
    expect(queue.isRunning).toBe(false);
  });

  test('cancel while running', async () => {
    const queue = new QueueRunner();
    const task = new Task();
    queue.add(task.prepare, 'one');
    queue.runNext();
    await sleep(0);
    task.completePrepare(false);
    await sleep(0);
    expect(task.state).toBe('running');
    queue.cancel();
    await queue.waitUntilFinished();
    expect(task.state).toBe('canceled');
    expect(queue.length).toBe(0);
    expect(queue.state).toBe(null);
    expect(queue.isRunning).toBe(false);
  });

  test('run sequentially', async () => {
    const queue = new QueueRunner({
      log: ({ state, label }) => console.log(`QueueRunner: ${state} ${label}`),
    });
    const results: number[] = [];
    for (const n of [1, 2, 3]) {
      const task = new Task(t => {
        results.push(n);
        t.completePrepare(false);
        t.completeRun();
      });
      queue.add(task.prepare, n.toString());
    }
    queue.runNext();
    await queue.waitUntilFinished();
    expect(results).toEqual([1, 2, 3]);
  });

  test('cancelQueue', async () => {
    const queue = new QueueRunner();
    const task = new Task();
    queue.add(task.prepare, 'one');
    task.completePrepare(false);
    const task2 = new Task();
    queue.add(task2.prepare, 'two');
    expect(queue.length).toBe(2);
    queue.runNext();
    await sleep(0);
    expect(task.state).toBe('running');
    expect(queue.isRunning).toBe(true);
    queue.cancelQueue();
    expect(task.state).toBe('running');
    expect(queue.length).toBe(0);
    task.completeRun();
    await queue.waitUntilFinished();
    expect(queue.isRunning).toBe(false);
  });
});
