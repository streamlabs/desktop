import type { ICaptureStatus } from 'obs-studio-node';

type Translate = (key: string, params?: Record<string, string>) => string;

export function cameraFailureMessage(status: ICaptureStatus, sourceName: string, t: Translate) {
  return status.reason === 'insufficient_bandwidth'
    ? t('“%{source}” could not start. Windows reported insufficient USB bandwidth.', {
        source: sourceName,
      })
    : t('“%{source}” could not start.', { source: sourceName });
}

export function cameraFailureAdvice(status: ICaptureStatus, t: Translate) {
  if (status.reason === 'insufficient_bandwidth') {
    return t(
      'Try lowering your cameras’ resolution or frame rate, deactivating unused cameras, or connecting a camera to a port on a different USB controller.',
    );
  }
  if (status.reason === 'device_not_found') {
    return t('The selected camera could not be found. Reconnect it or select another device.');
  }
  return t(
    'Check that the camera is connected, close other apps that may be using it, and try a lower resolution or frame rate.',
  );
}

export function cameraErrorCode(status: ICaptureStatus) {
  return status.errorCode
    ? `0x${status.errorCode.toString(16).toUpperCase().padStart(8, '0')}`
    : '';
}

/** Deduplicate a failure across retries, but allow a new warning after recovery or recreation. */
export class CameraFailureTracker {
  private seen: Record<string, { instanceId: string; signature: string }> = {};
  private displayed: Record<string, string> = {};

  update(statuses: ICaptureStatus[]) {
    const errors: Record<string, ICaptureStatus> = {};
    const notify: ICaptureStatus[] = [];
    const clear: string[] = [];
    const retrying = new Set<string>();
    const present = new Set(statuses.map(status => status.sourceName));

    for (const name of Object.keys(this.seen)) {
      if (!present.has(name)) delete this.seen[name];
    }
    for (const status of statuses) {
      const name = status.sourceName;
      if (this.seen[name]?.instanceId !== status.instanceId) delete this.seen[name];
      if (status.state === 'running' || status.state === 'inactive') delete this.seen[name];
      // Keep the existing notification while the same source retries. Its inline
      // status can clear during startup without losing the notification if it fails again.
      if (status.state === 'starting' && this.seen[name]) retrying.add(name);
      if (status.state !== 'error') continue;

      errors[name] = status;
      const signature = JSON.stringify([
        status.instanceId,
        status.deviceName,
        status.reason,
        status.errorCode,
      ]);
      if (this.seen[name]?.signature !== signature) {
        notify.push(status);
        this.seen[name] = { instanceId: status.instanceId, signature };
      }
      if (this.displayed[name] && this.displayed[name] !== signature) clear.push(name);
      this.displayed[name] = signature;
    }
    for (const name of Object.keys(this.displayed)) {
      if (!errors[name] && !retrying.has(name)) {
        clear.push(name);
        delete this.displayed[name];
      }
    }
    return { errors, notify, clear };
  }
}
