import test from 'ava';
import type { ICaptureStatus } from 'obs-studio-node';
import {
  CameraFailureTracker,
  cameraFailureMessage,
  cameraFailureAdvice,
  cameraErrorCode,
} from '../../app/services/camera-status';

const failure: ICaptureStatus = {
  sourceName: 'source-a',
  instanceId: '1',
  generation: 1,
  state: 'error',
  reason: 'insufficient_bandwidth',
  deviceName: 'Camera A',
  errorCode: 0x800718cf,
};
const translate = (key: string, params: Record<string, string> = {}) =>
  key.replace(/%\{(\w+)\}/g, (_, name) => params[name]);

test('camera copy distinguishes bandwidth, unavailable device, and generic errors', t => {
  t.true(cameraFailureMessage(failure, 'Face camera', translate).includes('“Face camera”'));
  t.true(cameraFailureMessage(failure, 'Face camera', translate).includes('USB bandwidth'));
  t.true(cameraFailureAdvice(failure, translate).includes('different USB controller'));
  t.is(cameraErrorCode(failure), '0x800718CF');
  const generic = { ...failure, reason: 'start_failed' as const, errorCode: 0x800705aa };
  t.false(cameraFailureMessage(generic, 'Face camera', translate).includes('bandwidth'));
  t.false(cameraFailureAdvice(generic, translate).includes('USB controller'));
  t.is(cameraErrorCode({ ...generic, errorCode: 0 }), '');
  t.true(
    cameraFailureAdvice({ ...failure, reason: 'device_not_found' }, translate).includes(
      'Reconnect',
    ),
  );
});

for (const scenario of [
  {
    reason: 'access_denied' as const,
    errorCode: 0x80070005,
    message: 'Windows denied access to the camera',
    advice: 'allow desktop apps to access your camera',
    formattedCode: '0x80070005',
  },
  {
    reason: 'invalid_configuration' as const,
    errorCode: 0x800718ce,
    message: 'Windows reported an invalid camera configuration',
    advice: 'Select Device Default for Resolution/FPS Type',
    formattedCode: '0x800718CE',
  },
]) {
  test(`camera ${scenario.reason} warning gives specific advice and preserves native details`, t => {
    const status: ICaptureStatus = {
      ...failure,
      reason: scenario.reason,
      errorCode: scenario.errorCode,
    };
    const message = cameraFailureMessage(status, 'Face camera', translate);
    const advice = cameraFailureAdvice(status, translate);
    t.true(message.includes('“Face camera”'));
    t.true(message.includes(scenario.message));
    t.true(advice.includes(scenario.advice));
    t.false(message.includes('bandwidth'));
    t.false(advice.includes('USB controller'));
    t.is(cameraErrorCode(status), scenario.formattedCode);
  });

  test(`camera ${scenario.reason} warning replaces an earlier failure and clears on recovery`, t => {
    const tracker = new CameraFailureTracker();
    const other: ICaptureStatus = { ...failure, sourceName: 'source-b', instanceId: '2' };
    tracker.update([failure, other]);
    const changed: ICaptureStatus = {
      ...failure,
      reason: scenario.reason,
      errorCode: scenario.errorCode,
      generation: 2,
    };
    const update = tracker.update([changed, other]);
    t.deepEqual(update.notify, [changed]);
    t.deepEqual(update.clear, ['source-a']);
    t.deepEqual(update.errors, { 'source-a': changed, 'source-b': other });
    t.deepEqual(tracker.update([changed, other]).notify, []);

    const recovered: ICaptureStatus = {
      ...changed,
      generation: 3,
      state: 'running',
      reason: '',
      errorCode: 0,
    };
    t.deepEqual(tracker.update([recovered, other]), {
      errors: { 'source-b': other },
      notify: [],
      clear: ['source-a'],
    });
  });
}

test('repeated failures and retries do not repeatedly notify', t => {
  const tracker = new CameraFailureTracker();
  t.deepEqual(tracker.update([failure]).notify, [failure]);
  t.deepEqual(tracker.update([failure]).notify, []);
  const starting = { ...failure, state: 'starting' as const, reason: '' as const, errorCode: 0 };
  t.deepEqual(tracker.update([starting]), { errors: {}, notify: [], clear: [] });
  const retry = { ...failure, generation: 2 };
  const result = tracker.update([retry]);
  t.deepEqual(result.notify, []);
  t.deepEqual(result.errors, { 'source-a': retry });
});

test('a failed retry retains one notification until recovery or deactivation', t => {
  for (const terminalState of ['running', 'inactive'] as const) {
    const tracker = new CameraFailureTracker();
    const notifications = new Map<string, number>();
    let pushes = 0;
    // Apply the same notification effects as CameraStatusService, including removals.
    const poll = (statuses: ICaptureStatus[]) => {
      const update = tracker.update(statuses);
      update.clear.forEach(name => notifications.delete(name));
      update.notify.forEach(status => notifications.set(status.sourceName, ++pushes));
      return update;
    };
    poll([failure]);
    const originalNotification = notifications.get(failure.sourceName);
    for (const generation of [2, 3]) {
      poll([{ ...failure, generation, state: 'starting', reason: '', errorCode: 0 }]);
      t.is(notifications.get(failure.sourceName), originalNotification);
      poll([{ ...failure, generation }]);
      t.is(notifications.get(failure.sourceName), originalNotification);
      t.is(pushes, 1);
    }
    poll([{ ...failure, state: terminalState }]);
    t.is(notifications.size, 0);
    poll([failure]);
    t.is(pushes, 2);
  }
});

test('a retrying notification is cleared on removal or replacement by a new lifetime', t => {
  for (const replacement of [[], [{ ...failure, instanceId: '2', state: 'starting' as const }]]) {
    const tracker = new CameraFailureTracker();
    tracker.update([failure]);
    tracker.update([{ ...failure, state: 'starting' }]);
    t.deepEqual(tracker.update(replacement).clear, ['source-a']);
    t.deepEqual(tracker.update([{ ...failure, instanceId: '2' }]).notify, [
      { ...failure, instanceId: '2' },
    ]);
  }
});

test('a different failure after a retry replaces the retained notification', t => {
  const tracker = new CameraFailureTracker();
  tracker.update([failure]);
  tracker.update([{ ...failure, state: 'starting' }]);
  const changed = { ...failure, reason: 'start_failed' as const, errorCode: 0x8007001f };
  const result = tracker.update([changed]);
  t.deepEqual(result.clear, ['source-a']);
  t.deepEqual(result.notify, [changed]);
});

test('recovery, deactivation, removal and new source lifetime reset deduplication', t => {
  for (const state of ['running', 'inactive'] as const) {
    const tracker = new CameraFailureTracker();
    tracker.update([failure]);
    t.deepEqual(tracker.update([{ ...failure, state }]).clear, ['source-a']);
    t.is(tracker.update([failure]).notify.length, 1);
  }
  const tracker = new CameraFailureTracker();
  tracker.update([failure]);
  t.deepEqual(tracker.update([]), { errors: {}, notify: [], clear: ['source-a'] });
  t.is(tracker.update([failure]).notify.length, 1);
  const recreated = { ...failure, instanceId: '2' };
  t.deepEqual(tracker.update([recreated]).notify, [recreated]);
});

test('multiple sources are independent and changing a device replaces the warning', t => {
  const tracker = new CameraFailureTracker();
  const other = { ...failure, sourceName: 'source-b', instanceId: '2' };
  t.is(tracker.update([failure, other]).notify.length, 2);
  const changed = {
    ...failure,
    deviceName: 'Camera C',
    reason: 'start_failed' as const,
    errorCode: 0,
  };
  const result = tracker.update([changed, other]);
  t.deepEqual(result.clear, ['source-a']);
  t.deepEqual(result.notify, [changed]);
  t.deepEqual(result.errors['source-b'], other);
});
