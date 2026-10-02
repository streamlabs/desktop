import test from 'ava';
import { ENotificationType } from '../../app/services/notifications/notifications-api';
import {
  RESOLUTION_CHANGE_NOTIFICATION_CODE,
  createResolutionChangeNotification,
} from '../../app/services/streaming/enhanced-broadcasting-notifications';

const RESOLUTION_CHANGE_SIGNAL = 'enhanced_broadcasting_resolution_change';

test('createResolutionChangeNotification creates a single canvas info notification', t => {
  const notification = createResolutionChangeNotification({
    signal: RESOLUTION_CHANGE_SIGNAL,
    error: JSON.stringify({
      resolution_changes: [{ canvas: 'horizontal', width: 1920, height: 1080 }],
    }),
  });

  t.deepEqual(notification, {
    code: RESOLUTION_CHANGE_NOTIFICATION_CODE,
    data: {
      resolutionChanges: [{ canvas: 'horizontal', width: 1920, height: 1080 }],
    },
    lifeTime: -1,
    message:
      'Your resolution for the horizontal canvas has been changed to 1920\u00d71080 because Enhanced Broadcasting detected it as the optimal configuration for your system.',
    singleton: true,
    type: ENotificationType.INFO,
  });
});

test('createResolutionChangeNotification ignores raw Twitch status messages', t => {
  t.is(
    createResolutionChangeNotification({
      signal: RESOLUTION_CHANGE_SIGNAL,
      error: JSON.stringify({
        result: 'warning',
        html_en_us: 'Heads Up: Your current GPU is not optimal.',
      }),
    }),
    null,
  );
});

test('createResolutionChangeNotification ignores unrelated or malformed signals', t => {
  t.is(
    createResolutionChangeNotification({
      signal: 'enhanced_broadcasting_config_status',
      error: JSON.stringify({
        resolution_changes: [{ canvas: 'horizontal', width: 1920, height: 1080 }],
      }),
    }),
    null,
  );
  t.is(
    createResolutionChangeNotification({
      signal: RESOLUTION_CHANGE_SIGNAL,
      error: '{',
    }),
    null,
  );
  t.is(
    createResolutionChangeNotification({
      type: 'recording',
      signal: RESOLUTION_CHANGE_SIGNAL,
      error: JSON.stringify({
        resolution_changes: [{ canvas: 'horizontal', width: 1920, height: 1080 }],
      }),
    }),
    null,
  );
  t.is(
    createResolutionChangeNotification({
      signal: RESOLUTION_CHANGE_SIGNAL,
      error: JSON.stringify({
        resolution_changes: [{ canvas: 'horizontal', width: 0, height: 1080 }],
      }),
    }),
    null,
  );
});

test('createResolutionChangeNotification creates a dual canvas info notification', t => {
  const notification = createResolutionChangeNotification({
    signal: RESOLUTION_CHANGE_SIGNAL,
    error: JSON.stringify({
      resolution_changes: [
        { canvas: 'vertical', width: 1080, height: 1920 },
        { canvas: 'horizontal', width: 1920, height: 1080 },
      ],
    }),
  });

  t.deepEqual(notification, {
    code: RESOLUTION_CHANGE_NOTIFICATION_CODE,
    data: {
      resolutionChanges: [
        { canvas: 'horizontal', width: 1920, height: 1080 },
        { canvas: 'vertical', width: 1080, height: 1920 },
      ],
    },
    lifeTime: -1,
    message:
      'Your resolutions have been changed to 1920\u00d71080 for the horizontal canvas and 1080\u00d71920 for the vertical canvas because Enhanced Broadcasting detected them as the optimal configurations for your system.',
    singleton: true,
    type: ENotificationType.INFO,
  });
});
