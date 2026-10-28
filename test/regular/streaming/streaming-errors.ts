import { test, useWebdriver } from '../../helpers/webdriver';
import { focusWindow } from '../../helpers/modules/core';

// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver();

test('Streaming error reporting preserves typed errors and explicit remapping', async t => {
  t.true(await focusWindow('worker'));
  const result = await t.context.app.client.execute(() => {
    const service = (window as any).servicesManager.getResource('StreamingService');
    const prototype = Object.getPrototypeOf(service);
    const state = { info: { error: null as any } };
    const context = {
      state,
      views: { getPlatformDisplayName: () => 'Twitch' },
      streamErrorCreated: { next() {} },
      SET_ERROR(error: any) {
        state.info.error = error;
      },
      setError(error: any, platform?: string): any {
        return prototype.setError.call(this, error, platform);
      },
    };

    // These calls deliberately report errors. Keep their expected console output out of
    // the application log while exercising the real reporting methods on isolated state.
    const originalConsoleError = console.error;
    console.error = () => {};
    try {
      const error = context.setError('SETTINGS_UPDATE_FAILED', 'twitch');
      error.details = 'Test platform failure';
      error.status = 403;
      error.reason = 'testPermissionFailure';

      const preservedType = prototype.handleTypedStreamError.call(
        context,
        error,
        'PREPOPULATE_FAILED',
        'Fallback message',
        'twitch',
      );
      const preserved = {
        type: preservedType,
        typedError: state.info.error instanceof error.constructor,
        details: state.info.error.details,
        status: state.info.error.status,
        reason: state.info.error.reason,
        message: state.info.error.message,
      };

      const remappedType = prototype.handleTypedStreamError.call(
        context,
        error,
        'TWITCH_MISSED_OAUTH_SCOPE',
        'Missing scope',
        'twitch',
        true,
      );
      return {
        preserved,
        remappedType,
        reportedType: state.info.error.type,
        originalType: error.type,
      };
    } finally {
      console.error = originalConsoleError;
    }
  });

  t.is(result.preserved.type, 'SETTINGS_UPDATE_FAILED');
  t.true(result.preserved.typedError);
  t.is(result.preserved.details, 'Test platform failure');
  t.is(result.preserved.status, 403);
  t.is(result.preserved.reason, 'testPermissionFailure');
  t.truthy(result.preserved.message);
  t.is(result.remappedType, 'TWITCH_MISSED_OAUTH_SCOPE');
  t.is(result.reportedType, 'TWITCH_MISSED_OAUTH_SCOPE');
  t.is(result.originalType, 'SETTINGS_UPDATE_FAILED');
});
