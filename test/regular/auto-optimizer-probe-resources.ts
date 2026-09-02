import test from 'ava';
import { IYoutubeAutoOptimizerProbeLease } from '../../app/services/platforms/youtube';
import {
  AutoConfigProbeResources,
  AutoOptimizerProbeSetupError,
} from '../../app/services/auto-config/probe-resources';
import { IAutoConfigRun } from '../../app/services/auto-config/native-run';
import {
  IAutoConfigNativeResult,
  IAutoOptimizerOutput,
  IAutoOptimizerStreamSetup,
} from '../../app/services/auto-config/types';

function output(
  outputId: string,
  platform: 'twitch' | 'youtube',
  display: 'horizontal' | 'vertical' = 'horizontal',
): IAutoOptimizerOutput {
  return {
    outputId,
    display,
    outputKind: 'standard',
    destinations: [{ platform }],
    probeCandidates: [
      {
        probeId: `${platform}-${outputId}`,
        kind: platform === 'twitch' ? 'twitch-standard' : 'youtube-unbound',
        outputId,
        platform,
      },
    ],
    measurement: 'active',
  };
}

function lease(): IYoutubeAutoOptimizerProbeLease {
  return {
    probeId: 'youtube-runtime-id',
    streamId: 'temporary-stream',
    accountId: 'channel',
    createdAt: 1,
    server: 'rtmps://youtube.example/live2',
    streamKey: 'youtube-secret',
  };
}

function services(
  overrides: {
    acquire?: () => Promise<IYoutubeAutoOptimizerProbeLease>;
    wait?: () => Promise<boolean>;
    release?: (lease: IYoutubeAutoOptimizerProbeLease) => Promise<void>;
  } = {},
) {
  return {
    twitch: {
      fetchStreamKey: async () => 'twitch-secret',
    },
    youtube: {
      acquireAutoOptimizerProbe: async () => (overrides.acquire ? overrides.acquire() : lease()),
      waitForAutoOptimizerProbeActive: async () => (overrides.wait ? overrides.wait() : true),
      releaseAutoOptimizerProbe: async (value: IYoutubeAutoOptimizerProbeLease) =>
        overrides.release ? overrides.release(value) : undefined,
    },
  };
}

test('platform resources prepare request probes without retaining YouTube credentials', async t => {
  const mocks = services();
  const resources = new AutoConfigProbeResources(mocks.twitch, mocks.youtube);
  const streamSetup: IAutoOptimizerStreamSetup = {
    type: 'cloud-multistream',
    outputs: [
      {
        ...output('shared', 'twitch'),
        destinations: [{ platform: 'twitch' }, { platform: 'youtube' }],
        probeCandidates: [
          output('shared', 'twitch').probeCandidates[0],
          output('shared', 'youtube').probeCandidates[0],
        ],
      },
    ],
  };

  const prepared = await resources.prepare(streamSetup);
  const probes = prepared.probesByOutput.get('shared')!;
  t.deepEqual(
    probes.map(probe => [probe.id, probe.kind, probe.streamKey]),
    [
      ['twitch-shared', 'twitch-standard', 'twitch-secret'],
      ['youtube-runtime-id', 'youtube-unbound', 'youtube-secret'],
    ],
  );
  t.is(prepared.streamSetup.outputs[0].probeCandidates[1].probeId, 'youtube-runtime-id');

  resources.redactCredentials();
  t.true(probes.every(probe => probe.streamKey === ''));
  await resources.cleanupAfterNativeClose(async () => undefined);
});

test('a shared output keeps one successful platform as partial active coverage', async t => {
  const mocks = services({
    acquire: async () => {
      throw new Error('YouTube unavailable');
    },
  });
  const resources = new AutoConfigProbeResources(mocks.twitch, mocks.youtube);
  const prepared = await resources.prepare({
    type: 'cloud-multistream',
    outputs: [
      {
        ...output('shared', 'twitch'),
        destinations: [{ platform: 'twitch' }, { platform: 'youtube' }],
        probeCandidates: [
          output('shared', 'twitch').probeCandidates[0],
          output('shared', 'youtube').probeCandidates[0],
        ],
      },
    ],
  });

  t.is(prepared.streamSetup.outputs[0].measurement, 'active');
  t.is(prepared.streamSetup.outputs[0].estimateReason, 'partial_provider_probes');
  t.deepEqual(
    prepared.probesByOutput.get('shared')!.map(probe => probe.kind),
    ['twitch-standard'],
  );
  await resources.cleanupAfterNativeClose(async () => undefined);
});

test('exact Dual Output preparation rejects partial platform resource acquisition', async t => {
  const mocks = services({
    acquire: async () => {
      throw new Error('YouTube unavailable');
    },
  });
  const resources = new AutoConfigProbeResources(mocks.twitch, mocks.youtube);
  const streamSetup: IAutoOptimizerStreamSetup = {
    type: 'dual-output',
    outputs: [output('horizontal', 'twitch'), output('vertical', 'youtube', 'vertical')],
  };

  const error = await t.throwsAsync(resources.prepare(streamSetup));
  t.true(error instanceof AutoOptimizerProbeSetupError);
});

test('YouTube ingest is confirmed once for the exact prepared probe', async t => {
  let resolveConfirmation!: (received: boolean) => void;
  const confirmation = new Promise<boolean>(resolve => {
    resolveConfirmation = resolve;
  });
  const mocks = services({ wait: () => confirmation });
  const resources = new AutoConfigProbeResources(mocks.twitch, mocks.youtube);
  await resources.prepare({ type: 'direct-single', outputs: [output('youtube', 'youtube')] });

  let confirms = 0;
  const confirmed = new Promise<void>(resolve => {
    const run: IAutoConfigRun = {
      result: new Promise<IAutoConfigNativeResult>(() => undefined),
      cancel: async () => undefined,
      confirmProbeIngest: (probeId, received) => {
        confirms++;
        t.is(probeId, 'youtube-runtime-id');
        t.true(received);
        resolve();
      },
    };
    resources.confirmYoutubeIngest(
      'youtube-runtime-id',
      () => run,
      () => true,
    );
    resources.confirmYoutubeIngest(
      'youtube-runtime-id',
      () => run,
      () => true,
    );
  });

  resolveConfirmation(true);
  await confirmed;
  t.is(confirms, 1);
  await resources.cleanupAfterNativeClose(async () => undefined);
});

test('temporary resources remain retained until OSN cleanup succeeds', async t => {
  let releaseCalls = 0;
  const mocks = services({
    release: async () => {
      releaseCalls++;
    },
  });
  const resources = new AutoConfigProbeResources(mocks.twitch, mocks.youtube);
  const prepared = await resources.prepare({
    type: 'direct-single',
    outputs: [output('youtube', 'youtube')],
  });

  const first = await t.throwsAsync(
    resources.cleanupAfterNativeClose(async () => {
      throw new Error('native close failed');
    }),
  );
  t.is(first?.message, 'native close failed');
  t.is(releaseCalls, 0);
  t.is(prepared.probesByOutput.get('youtube')![0].streamKey, '');

  await resources.cleanupAfterNativeClose(async () => undefined);
  t.is(releaseCalls, 1);
});
