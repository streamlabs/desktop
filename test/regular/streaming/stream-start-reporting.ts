import { focusMain, focusWindow } from '../../helpers/modules/core';
import { test, useWebdriver } from '../../helpers/webdriver';

// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver({ restartAppAfterEachTest: false });

for (const failReporting of [false, true]) {
  test(`stream start stays successful when encoder reporting ${
    failReporting ? 'fails' : 'succeeds'
  }`, async t => {
    t.true(await focusWindow('worker'), 'worker window is available');
    try {
      // Call the production start-signal handler with isolated dependencies.
      // No output is started and no analytics event leaves the test fixture.
      const result = (await t.context.app.client.executeAsync((shouldFail: boolean, done) => {
        const service = (window as any).servicesManager.getResource('StreamingService');
        const statuses: string[] = [];
        const streamErrors: string[] = [];
        const events: { name: string; metadata: Record<string, unknown> }[] = [];
        let resolved = 0;
        const fixture = {
          highlighterService: { shouldStartHighlighterOutputs: false },
          streamSettingsService: {
            settings: {
              replayBufferWhileStreaming: false,
              recordWhenStreaming: false,
              streamType: 'rtmp_common',
              platform: 'twitch',
              service: 'Twitch',
            },
          },
          outputSettingsService: {
            getSettings: () => {
              if (shouldFail) throw new Error('Missing streaming encoder family metadata');
              return { mode: 'Simple' };
            },
          },
          views: {
            game: 'Test game',
            isDualOutputMode: false,
            protectedModeEnabled: true,
            enabledPlatforms: ['twitch'],
            customDestinations: [] as { enabled: boolean }[],
          },
          videoEncodingOptimizationService: { state: { useOptimizedProfile: false } },
          SET_STREAMING_STATUS: (status: string) => statuses.push(status),
          resolveStartStreaming: () => resolved++,
          handleTypedStreamError: (_error: unknown, type: string) => streamErrors.push(type),
          usageStatisticsService: {
            recordEvent: (name: string, metadata: Record<string, unknown>) =>
              events.push({ name, metadata }),
            recordAnalyticsEvent: (): void => undefined,
            recordFeatureUsage: (): void => undefined,
          },
        };
        Object.getPrototypeOf(service)
          .handleStartStreaming.call(fixture, 0, 'horizontal')
          .then(() => done({ statuses, resolved, streamErrors, events }))
          .catch((error: Error) =>
            done({ statuses, resolved, streamErrors, events, error: error.message }),
          );
      }, failReporting)) as {
        statuses: string[];
        resolved: number;
        streamErrors: string[];
        events: { name: string; metadata: Record<string, unknown> }[];
        error?: string;
      };
      t.falsy(result.error);
      t.deepEqual(result.statuses, ['live']);
      t.is(result.resolved, 1);
      t.deepEqual(result.streamErrors, []);
      t.is(result.events.length, 1);
      t.is(result.events[0].name, 'stream_start');
      t.deepEqual(result.events[0].metadata.platforms, ['twitch']);
      t.is(result.events[0].metadata.mode, failReporting ? undefined : 'Simple');
    } finally {
      await focusMain();
    }
  });
}
