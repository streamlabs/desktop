import test from 'ava';
import type { IMouseEvent } from '../../app/services/editor';
import { createEditorMouseMoveDispatcher } from '../../app/util/editor-mouse-move';

function mouseMove(display: IMouseEvent['display'], pageX: number): IMouseEvent {
  return {
    offsetX: pageX,
    offsetY: 20,
    pageX,
    pageY: 20,
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    metaKey: false,
    button: 0,
    buttons: 1,
    display,
  };
}

// TODO: Replace this helper with Promise.withResolvers<void>() when we migrate to Node 22.
function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test('Editor mouse moves coalesce to the newest canvas and coordinate snapshot', async t => {
  const firstResponse = deferred();
  const received: IMouseEvent[] = [];
  const errors: unknown[] = [];
  const dispatch = createEditorMouseMoveDispatcher(
    event => {
      received.push(event);
      return received.length === 1 ? firstResponse.promise : Promise.resolve();
    },
    error => errors.push(error),
  );

  const first = mouseMove('horizontal', 10);
  const latest = mouseMove('vertical', 30);
  const expectedLatest = { ...latest };
  const drained = dispatch(first);
  await dispatch(mouseMove('horizontal', 20));
  await dispatch(latest);

  // Pending events must not read a later mutation of the caller's event object.
  latest.display = 'horizontal';
  latest.pageX = 999;
  t.deepEqual(received, [first], 'only one request is in flight');

  firstResponse.resolve();
  await drained;
  t.deepEqual(received, [first, expectedLatest]);
  t.deepEqual(errors, []);

  const next = mouseMove('horizontal', 40);
  await dispatch(next);
  t.deepEqual(received, [first, expectedLatest, next], 'the successful drain releases the gate');
});

test('A rejected editor move drops stale pending moves and permits another scene and canvas', async t => {
  const firstResponse = deferred();
  const failure = new Error('Worker could not construct the folder drag rectangle');
  let activeScene = 'Social Media';
  const received: Array<{ scene: string; event: IMouseEvent }> = [];
  const errors: Array<{ error: unknown; event: IMouseEvent }> = [];
  const dispatch = createEditorMouseMoveDispatcher(
    event => {
      received.push({ scene: activeScene, event });
      return received.length === 1 ? firstResponse.promise : Promise.resolve();
    },
    (error, event) => errors.push({ error, event }),
  );

  const failedMove = mouseMove('vertical', 10);
  const drained = dispatch(failedMove);
  await dispatch(mouseMove('vertical', 20));
  firstResponse.reject(failure);
  await drained;

  t.deepEqual(errors, [{ error: failure, event: failedMove }]);
  t.deepEqual(received, [{ scene: 'Social Media', event: failedMove }]);

  activeScene = 'Ending';
  const horizontalMove = mouseMove('horizontal', 40);
  const verticalMove = mouseMove('vertical', 50);
  await dispatch(horizontalMove);
  await dispatch(verticalMove);
  t.deepEqual(received, [
    { scene: 'Social Media', event: failedMove },
    { scene: 'Ending', event: horizontalMove },
    { scene: 'Ending', event: verticalMove },
  ]);
});

test('A synchronous editor dispatch failure releases the gate and reports the original error', async t => {
  const failure = new Error('IPC send failed');
  const received: IMouseEvent[] = [];
  const errors: unknown[] = [];
  const dispatch = createEditorMouseMoveDispatcher(
    event => {
      received.push(event);
      if (received.length === 1) throw failure;
      return Promise.resolve();
    },
    error => errors.push(error),
  );

  const first = mouseMove('vertical', 10);
  const second = mouseMove('horizontal', 20);
  await dispatch(first);
  await dispatch(second);

  t.deepEqual(received, [first, second]);
  t.deepEqual(errors, [failure]);
});

test('A failed coalesced move reports its own canvas and allows the next gesture', async t => {
  const firstResponse = deferred();
  const failure = new Error('Vertical worker move failed');
  const received: IMouseEvent[] = [];
  const errors: Array<{ error: unknown; event: IMouseEvent }> = [];
  const dispatch = createEditorMouseMoveDispatcher(
    event => {
      received.push(event);
      if (received.length === 1) return firstResponse.promise;
      if (received.length === 2) return Promise.reject(failure);
      return Promise.resolve();
    },
    (error, event) => errors.push({ error, event }),
  );

  const first = mouseMove('horizontal', 10);
  const queued = mouseMove('vertical', 20);
  const drained = dispatch(first);
  await dispatch(queued);
  firstResponse.resolve();
  await drained;

  const next = mouseMove('horizontal', 30);
  await dispatch(next);
  t.deepEqual(received, [first, queued, next]);
  t.deepEqual(errors, [{ error: failure, event: queued }]);
});
