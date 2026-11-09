import { focusMain, focusWindow } from '../../helpers/modules/core';
import { test, useWebdriver, TExecutionContext } from '../../helpers/webdriver';

// eslint-disable-next-line react-hooks/rules-of-hooks
useWebdriver({ restartAppAfterEachTest: false });

/**
 * Regression coverage for dual output Go Live with a service-checked encoder (NVENC HEVC).
 *
 * The first display to go live makes StreamingService.isStreaming true while the second
 * display's streaming instance is still being created and has no service assigned. OSN
 * filters service-checked encoders out of a service-less instance's list, so encoder
 * metadata read from that instance was missing the selected encoder and Go Live failed
 * with "Missing streaming encoder family metadata for obs_nvenc_hevc_tex".
 *
 * These tests call the production EncoderQueryService methods in the worker with a stubbed
 * streaming service and encoder queries, so no output is started and no specific encoder
 * hardware is required.
 */

// 'with-service-kick': streaming to Kick (rtmp_custom), whose live list still includes HEVC
// because the service declares no codecs; Desktop must filter it by Kick's codec table.
// 'twitch-not-streaming': Twitch enabled and not live. Twitch's rtmp_common service declares
// only H.264, so a query through it drops HEVC even though the machine can encode it.
type TLiveInstanceState =
  | 'none'
  | 'without-service'
  | 'with-service'
  | 'with-service-kick'
  | 'twitch-not-streaming';

interface IQueryResult {
  metadataNames: string[];
  family: string | null;
  optionValues: string[];
  isAvailable: boolean | null;
  error?: string;
}

const SELECTED_ENCODER = 'obs_nvenc_hevc_tex';

async function queryWithLiveInstance(
  t: TExecutionContext,
  liveState: TLiveInstanceState,
): Promise<IQueryResult> {
  t.true(await focusWindow('worker'), 'worker window is available');
  try {
    return (await t.context.app.client.executeAsync(
      (
        state: TLiveInstanceState,
        selectedEncoder: string,
        done: (result: IQueryResult) => void,
      ) => {
        try {
          const encoder = (name: string, family: string, codec: string) => ({
            title: name,
            name,
            id: name,
            family,
            preset: 'preset',
            codec,
            streaming: true,
            recording: true,
          });
          // What the machine can encode with (temp-service query).
          const deviceEncoders = [
            encoder('obs_x264', 'x264', 'h264'),
            encoder(selectedEncoder, selectedEncoder, 'hevc'),
          ];
          // What OSN returns for an instance: a service-less instance drops
          // service-checked encoders, which is how the selected encoder went missing.
          // An rtmp_custom service (Kick) declares no codecs, so OSN keeps HEVC in its list.
          const liveEncoders =
            state === 'with-service-kick' ? deviceEncoders : [encoder('obs_x264', 'x264', 'h264')];

          const enabledPlatforms: Partial<Record<TLiveInstanceState, string[]>> = {
            'with-service-kick': ['kick'],
            'twitch-not-streaming': ['twitch'],
          };
          const streaming = state !== 'none' && state !== 'twitch-not-streaming';
          const live = !streaming
            ? null
            : {
                service: state.startsWith('with-service') ? { name: 'live-service' } : undefined,
                getAvailableEncoders: () => liveEncoders,
              };

          const service = (window as any).servicesManager.getResource('EncoderQueryService');
          const fixture = Object.create(Object.getPrototypeOf(service));
          fixture.streamingEncoderCache = new Map();
          fixture.recordingEncoderCache = new Map();
          // streamingService is an @Inject getter on the prototype; shadow it on the fixture.
          Object.defineProperty(fixture, 'streamingService', {
            value: {
              isStreaming: streaming,
              getStreamingInstance: () => live,
              views: {
                enabledPlatforms: enabledPlatforms[state] ?? ([] as string[]),
              },
            },
          });
          // A platform query goes through that platform's service; Twitch's drops HEVC.
          fixture.queryEncodersForPlatform = (_mode: string, platform: string | null) =>
            platform === 'twitch' ? [encoder('obs_x264', 'x264', 'h264')] : deviceEncoders;
          // The device query uses a codec-agnostic service, never the platform's.
          fixture.queryDeviceEncoders = () => deviceEncoders;

          const metadata = fixture.getAvailableStreamingEncoderMetadata('Advanced');
          const family = fixture.resolveStreamingEncoderFamily('Advanced', selectedEncoder);
          const options = fixture.getAvailableStreamingEncoders('Advanced');
          const isAvailable = fixture.isStreamingEncoderAvailable('Advanced', selectedEncoder);

          done({
            metadataNames: metadata.map((e: { name: string }) => e.name),
            family: family ?? null,
            optionValues: options.map((o: { value: string }) => o.value),
            isAvailable,
          });
        } catch (e: unknown) {
          done({
            metadataNames: [],
            family: null,
            optionValues: [],
            isAvailable: null,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      },
      liveState,
      SELECTED_ENCODER,
    )) as IQueryResult;
  } finally {
    await focusMain();
  }
}

test('encoder metadata ignores a live instance that has no service yet', async t => {
  const result = await queryWithLiveInstance(t, 'without-service');

  t.falsy(result.error);
  t.true(
    result.metadataNames.includes(SELECTED_ENCODER),
    'device metadata should come from the encoder query, not the service-less live instance',
  );
  t.is(
    result.family,
    SELECTED_ENCODER,
    'selected encoder family should resolve while another display is live',
  );
  t.true(
    result.optionValues.includes(SELECTED_ENCODER),
    'dropdown options should not be read from a live instance without a service',
  );
});

test('encoder metadata never reads from a live instance, even with a service', async t => {
  const result = await queryWithLiveInstance(t, 'with-service');

  t.falsy(result.error);
  t.true(
    result.metadataNames.includes(SELECTED_ENCODER),
    'device metadata should always come from the encoder query',
  );
  t.is(result.family, SELECTED_ENCODER);
  t.deepEqual(
    result.optionValues,
    ['obs_x264'],
    'dropdown options should still be read from a live instance that has a service',
  );
});

test('encoder metadata uses the encoder query when not streaming', async t => {
  const result = await queryWithLiveInstance(t, 'none');

  t.falsy(result.error);
  t.true(result.metadataNames.includes(SELECTED_ENCODER));
  t.is(result.family, SELECTED_ENCODER);
  t.true(result.optionValues.includes(SELECTED_ENCODER));
});

test('live encoder options are filtered by the platform codec table', async t => {
  const result = await queryWithLiveInstance(t, 'with-service-kick');

  t.falsy(result.error);
  t.deepEqual(
    result.optionValues,
    ['obs_x264'],
    'HEVC should not reappear in the dropdown while streaming to Kick',
  );
  t.true(
    result.metadataNames.includes(SELECTED_ENCODER),
    'device metadata should stay unfiltered so the selected encoder still resolves',
  );
  t.is(result.family, SELECTED_ENCODER);
});

test('a platform that rejects a codec does not make its encoder unavailable on the device', async t => {
  // Regression: startup validation reset NVENC HEVC to x264 for Twitch users (Twitch's
  // rtmp_common entry lists only H.264) and told them to update their graphics drivers.
  const result = await queryWithLiveInstance(t, 'twitch-not-streaming');

  t.falsy(result.error);
  t.true(result.isAvailable, 'HEVC should stay available on a machine that can encode it');
  t.true(result.metadataNames.includes(SELECTED_ENCODER));
  t.is(result.family, SELECTED_ENCODER);
  t.deepEqual(
    result.optionValues,
    ['obs_x264'],
    'the dropdown should still be narrowed by what Twitch accepts',
  );
});
