import * as obs from '../../obs-api';
import type { ICaptureStatus } from 'obs-studio-node';
import { mutation, StatefulService } from 'services/core/stateful-service';
import { Service } from 'services/core/service';
import { SourcesService } from 'services/sources';
import { JsonrpcService } from 'services/api/jsonrpc';
import { ENotificationType, NotificationsService } from 'services/notifications';
import { $t } from 'services/i18n';
import { CameraFailureTracker, cameraFailureMessage } from './camera-status';

interface ICameraStatusState {
  errors: Record<string, ICaptureStatus>;
}

export class CameraStatusService extends StatefulService<ICameraStatusState> {
  static initialState: ICameraStatusState = { errors: {} };

  @mutation()
  SET_ERRORS(errors: Record<string, ICaptureStatus>) {
    this.state.errors = errors;
  }
}

let timer: ReturnType<typeof setInterval> | undefined;
let stopMonitoring: (() => void) | undefined;

// Lifecycle functions are deliberately outside the RPC service surface. AppService calls
// them only in the worker, after OBS/collection initialization and before native teardown.
export function startCameraStatusMonitoring(service: CameraStatusService) {
  stopCameraStatusMonitoring();
  if (typeof obs.InputFactory.getCaptureStatuses !== 'function') return;
  const sources = SourcesService.instance;
  const notifications = NotificationsService.instance;
  const tracker = new CameraFailureTracker();
  const code = (sourceId: string) => `camera-start-failed:${sourceId}`;
  let lastErrors = '';
  let pollFailed = false;

  const refresh = () => {
    try {
      const statuses = obs.InputFactory.getCaptureStatuses().filter(status => {
        return sources.views.getSource(status.sourceName)?.type === 'dshow_input';
      });
      const { errors, clear, notify } = tracker.update(statuses);
      clear.forEach(name => notifications.removeByCode(code(name)));
      notify.forEach(status => {
        const source = sources.views.getSource(status.sourceName);
        notifications.push({
          code: code(status.sourceName),
          message: `${cameraFailureMessage(status, source.name, $t)} ${$t(
            'Open camera settings.',
          )}`,
          type: ENotificationType.WARNING,
          playSound: false,
          action: JsonrpcService.createRequest(
            Service.getResourceId(sources),
            'showSourceProperties',
            status.sourceName,
          ),
        });
      });
      const serialized = JSON.stringify(errors);
      if (serialized !== lastErrors) {
        service.SET_ERRORS(errors);
        lastErrors = serialized;
      }
      pollFailed = false;
    } catch (error: unknown) {
      // IPC failures are not evidence of a camera failure. Avoid logging every poll.
      if (!pollFailed) console.warn('[CameraStatus] Failed to read capture status.', error);
      pollFailed = true;
    }
  };

  // Remove warnings immediately when the source is removed, including collection switches.
  const removed = sources.sourceRemoved.subscribe(() => refresh());
  stopMonitoring = () => {
    removed.unsubscribe();
    tracker.update([]).clear.forEach(name => notifications.removeByCode(code(name)));
    service.SET_ERRORS({});
  };
  refresh();
  timer = setInterval(refresh, 500);
}

export function stopCameraStatusMonitoring() {
  if (timer) clearInterval(timer);
  timer = undefined;
  stopMonitoring?.();
  stopMonitoring = undefined;
}
