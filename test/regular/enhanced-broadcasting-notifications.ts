import test from 'ava';
import { ENotificationType } from '../../app/services/notifications/notifications-api';
import {
  ENHANCED_BROADCASTING_RESOLUTION_CHANGE_NOTIFICATION_CODE,
  ENHANCED_BROADCASTING_RESOLUTION_CHANGE_SIGNAL,
  createEnhancedBroadcastingResolutionChangeNotificationOptions,
  getEnhancedBroadcastingResolutionChangeNotification,
  isEnhancedBroadcastingResolutionChangeOutputSignal,
  parseEnhancedBroadcastingResolutionChangeSignal,
} from '../../app/services/enhanced-broadcasting-notifications';

test('parseEnhancedBroadcastingResolutionChangeSignal parses resolution changes', t => {
  t.deepEqual(
    parseEnhancedBroadcastingResolutionChangeSignal({
      signal: ENHANCED_BROADCASTING_RESOLUTION_CHANGE_SIGNAL,
      error: JSON.stringify({
        resolution_changes: [{ canvas: 'horizontal', width: 1920, height: 1080 }],
      }),
    }),
    {
      resolutionChanges: [{ canvas: 'horizontal', width: 1920, height: 1080 }],
    },
  );
});

test('parseEnhancedBroadcastingResolutionChangeSignal ignores raw Twitch status messages', t => {
  t.is(
    parseEnhancedBroadcastingResolutionChangeSignal({
      signal: ENHANCED_BROADCASTING_RESOLUTION_CHANGE_SIGNAL,
      error: JSON.stringify({
        result: 'warning',
        html_en_us: 'Heads Up: Your current GPU is not optimal.',
      }),
    }),
    null,
  );
});

test('parseEnhancedBroadcastingResolutionChangeSignal ignores unrelated or malformed signals', t => {
  t.is(
    parseEnhancedBroadcastingResolutionChangeSignal({
      signal: 'enhanced_broadcasting_config_status',
      error: JSON.stringify({
        resolution_changes: [{ canvas: 'horizontal', width: 1920, height: 1080 }],
      }),
    }),
    null,
  );
  t.is(
    parseEnhancedBroadcastingResolutionChangeSignal({
      signal: ENHANCED_BROADCASTING_RESOLUTION_CHANGE_SIGNAL,
      error: '{',
    }),
    null,
  );
  t.is(
    parseEnhancedBroadcastingResolutionChangeSignal({
      type: 'recording',
      signal: ENHANCED_BROADCASTING_RESOLUTION_CHANGE_SIGNAL,
      error: JSON.stringify({
        resolution_changes: [{ canvas: 'horizontal', width: 1920, height: 1080 }],
      }),
    } as any),
    null,
  );
  t.is(
    parseEnhancedBroadcastingResolutionChangeSignal({
      signal: ENHANCED_BROADCASTING_RESOLUTION_CHANGE_SIGNAL,
      error: JSON.stringify({
        resolution_changes: [{ canvas: 'horizontal', width: 0, height: 1080 }],
      }),
    }),
    null,
  );
});

test('isEnhancedBroadcastingResolutionChangeOutputSignal accepts streaming resolution signals', t => {
  t.true(
    isEnhancedBroadcastingResolutionChangeOutputSignal({
      type: 'streaming',
      signal: ENHANCED_BROADCASTING_RESOLUTION_CHANGE_SIGNAL,
      error: JSON.stringify({
        resolution_changes: [{ canvas: 'horizontal', width: 1920, height: 1080 }],
      }),
    }),
  );
  t.true(
    isEnhancedBroadcastingResolutionChangeOutputSignal({
      signal: ENHANCED_BROADCASTING_RESOLUTION_CHANGE_SIGNAL,
      error: JSON.stringify({
        resolution_changes: [{ canvas: 'horizontal', width: 1920, height: 1080 }],
      }),
    }),
  );
});

test('getEnhancedBroadcastingResolutionChangeNotification formats a single canvas change', t => {
  const notification = getEnhancedBroadcastingResolutionChangeNotification({
    resolutionChanges: [{ canvas: 'horizontal', width: 1920, height: 1080 }],
  });

  t.deepEqual(notification, {
    code: ENHANCED_BROADCASTING_RESOLUTION_CHANGE_NOTIFICATION_CODE,
    message:
      'Your resolution for the horizontal canvas has been changed to 1920\u00d71080 because Enhanced Broadcasting detected it as the optimal configuration for your system.',
    type: ENotificationType.INFO,
  });
});

test('getEnhancedBroadcastingResolutionChangeNotification formats both canvas changes', t => {
  const notification = getEnhancedBroadcastingResolutionChangeNotification({
    resolutionChanges: [
      { canvas: 'horizontal', width: 1920, height: 1080 },
      { canvas: 'vertical', width: 1080, height: 1920 },
    ],
  });

  t.deepEqual(notification, {
    code: ENHANCED_BROADCASTING_RESOLUTION_CHANGE_NOTIFICATION_CODE,
    message:
      'Your resolutions have been changed to 1920\u00d71080 for the horizontal canvas and 1080\u00d71920 for the vertical canvas because Enhanced Broadcasting detected them as the optimal configurations for your system.',
    type: ENotificationType.INFO,
  });
});

test('createEnhancedBroadcastingResolutionChangeNotificationOptions creates persistent info options', t => {
  const options = createEnhancedBroadcastingResolutionChangeNotificationOptions({
    resolutionChanges: [{ canvas: 'horizontal', width: 1920, height: 1080 }],
  });

  t.deepEqual(options, {
    code: ENHANCED_BROADCASTING_RESOLUTION_CHANGE_NOTIFICATION_CODE,
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
