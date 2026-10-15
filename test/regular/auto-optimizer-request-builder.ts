import test from 'ava';
import {
  AutoOptimizerRequestBuildError,
  buildAutoOptimizerRequest,
  IAutoOptimizerOutputSettingsSnapshot,
  IAutoOptimizerVideoSnapshot,
} from '../../app/services/auto-optimizer/request-builder';
import {
  IAutoOptimizerActiveProbe,
  IAutoOptimizerOutput,
  IAutoOptimizerStreamSetup,
} from '../../app/services/auto-optimizer/types';

const outputSettings: IAutoOptimizerOutputSettingsSnapshot = {
  streaming: {
    bitrate: 3000,
    encoderId: 'obs_nvenc_h264_tex',
    preset: 'p5',
  },
};

function video(
  canvasId: number | undefined,
  portrait = false,
  patch: Partial<IAutoOptimizerVideoSnapshot> = {},
): IAutoOptimizerVideoSnapshot {
  return {
    canvasId,
    baseWidth: portrait ? 720 : 1280,
    baseHeight: portrait ? 1280 : 720,
    outputWidth: portrait ? 720 : 1280,
    outputHeight: portrait ? 1280 : 720,
    fpsNum: 30,
    fpsDen: 1,
    ...patch,
  };
}

function videos(horizontalCanvasId = 0, verticalCanvasId = 1) {
  return {
    horizontal: video(horizontalCanvasId),
    vertical: video(verticalCanvasId, true),
  };
}

function optimizerOutput(patch: Partial<IAutoOptimizerOutput> = {}): IAutoOptimizerOutput {
  return {
    outputId: 'horizontal',
    display: 'horizontal',
    outputKind: 'standard',
    destinations: [{ platform: 'twitch' }],
    probeCandidates: [
      {
        probeId: 'horizontal-twitch',
        kind: 'twitch-standard',
        outputId: 'horizontal',
        platform: 'twitch',
      },
    ],
    measurement: 'active',
    ...patch,
  };
}

function streamSetup(
  outputs: IAutoOptimizerOutput[],
  type: IAutoOptimizerStreamSetup['type'] = 'direct-single',
): IAutoOptimizerStreamSetup {
  return { type, outputs };
}

test('ultrawide requests use platform and content ceilings without overwriting current settings', t => {
  for (const width of [3340, 3440]) {
    for (const allow1440p of [true, false]) {
      for (const multistream of [true, false]) {
        const snapshots = videos();
        Object.assign(snapshots.horizontal, {
          baseWidth: width,
          baseHeight: 1440,
          outputWidth: width,
          outputHeight: 1440,
        });
        const before = JSON.stringify(snapshots);
        const output = optimizerOutput({
          destinations: multistream
            ? [{ platform: 'twitch' }, { platform: 'youtube' }]
            : [{ platform: 'twitch' }],
        });
        const built = buildAutoOptimizerRequest({
          streamSetup: streamSetup([output]),
          outputProbes: [],
          outputSettings,
          videos: snapshots,
          allow1440p,
        });
        t.is(built.request.outputs[0].limits!.maxWidth, allow1440p && !multistream ? 2560 : 1920);
        t.is(built.request.outputs[0].limits!.maxHeight, allow1440p && !multistream ? 1440 : 1080);
        t.is(built.request.outputs[0].limits!.maxBitrateKbps, multistream ? 6000 : 7500);
        t.is(built.request.outputs[0].current.width, width);
        t.true(built.attemptContext.outputs[0].hasUltrawideResolution);
        t.false('hasUltrawideResolution' in built.request.outputs[0]);
        t.is(JSON.stringify(snapshots), before);
      }
    }
  }
});

test('an ultrawide canvas with a standard output keeps that output aspect and guide metadata', t => {
  const snapshots = videos();
  Object.assign(snapshots.horizontal, {
    baseWidth: 3440,
    baseHeight: 1440,
    outputWidth: 1920,
    outputHeight: 1080,
  });
  const built = buildAutoOptimizerRequest({
    streamSetup: streamSetup([optimizerOutput()]),
    outputProbes: [],
    outputSettings,
    videos: snapshots,
    allow1440p: false,
  });
  t.is(built.request.outputs[0].current.width, 1920);
  t.is(built.request.outputs[0].current.height, 1080);
  t.true(built.attemptContext.outputs[0].hasUltrawideResolution);
  snapshots.horizontal.baseWidth = 1920;
  t.true(
    built.attemptContext.outputs[0].hasUltrawideResolution,
    'the attempt keeps its own snapshot',
  );
});

test('promotion of a standard output does not require growing a custom canvas', t => {
  const snapshots = videos();
  Object.assign(snapshots.horizontal, {
    baseWidth: 2560,
    baseHeight: 1080,
    outputWidth: 1920,
    outputHeight: 1080,
  });
  const built = buildAutoOptimizerRequest({
    streamSetup: streamSetup([optimizerOutput()]),
    outputProbes: [],
    outputSettings,
    videos: snapshots,
    allow1440p: true,
  });
  t.is(built.request.outputs[0].limits!.maxHeight, 1080);
});

test('builds an active OSN request and retains only non-secret validation inputs', t => {
  const preparedStreamSetup = streamSetup([optimizerOutput()]);
  const probe: IAutoOptimizerActiveProbe = {
    id: 'horizontal-twitch',
    kind: 'twitch-standard',
    server: 'auto',
    streamKey: 'private-stream-key',
  };

  const built = buildAutoOptimizerRequest({
    streamSetup: preparedStreamSetup,
    outputProbes: [{ outputId: 'horizontal', probes: [probe] }],
    outputSettings,
    videos: videos(),
    allow1440p: true,
  });

  t.is(built.request.streamSetup, 'direct-single');
  t.deepEqual(built.request.outputs[0].current, {
    canvasId: 0,
    width: 1280,
    height: 720,
    fpsNum: 30,
    fpsDen: 1,
    bitrateKbps: 3000,
    encoderId: 'obs_nvenc_h264_tex',
    preset: 'p5',
  });
  t.deepEqual(built.request.outputs[0].limits, {
    maxBitrateKbps: 7500,
    maxWidth: 2560,
    maxHeight: 1440,
    maxFpsNum: 60,
    maxFpsDen: 1,
  });
  t.is(built.request.outputs[0].probes![0], probe, 'the request owns the credential object');
  t.false('probes' in built.attemptContext.outputs[0]);
  t.not(built.attemptContext.streamSetup, preparedStreamSetup);
  t.not(built.attemptContext.streamSetup.outputs[0], preparedStreamSetup.outputs[0]);

  const retained = JSON.stringify(built.attemptContext);
  t.false(retained.includes('private-stream-key'));
  t.false(retained.includes('streamKey'));
  t.false(retained.includes('server'));
});

test('1080p content skips 1440p in ordinary and Enhanced Broadcasting requests, including Dual Format', t => {
  for (const [outputKind, display, type] of [
    ['standard', 'horizontal', 'direct-single'],
    ['twitch-enhanced-broadcasting', 'horizontal', 'enhanced-broadcasting'],
    ['twitch-enhanced-broadcasting', 'both', 'enhanced-broadcasting'],
  ] as const) {
    const snapshots = videos();
    // A previous optimizer run may already have enlarged both saved resolutions.
    snapshots.horizontal = video(0, false, {
      baseWidth: 2560,
      baseHeight: 1440,
      outputWidth: 2560,
      outputHeight: 1440,
    });
    const built = buildAutoOptimizerRequest({
      streamSetup: streamSetup([optimizerOutput({ outputKind, display })], type),
      outputProbes: [],
      outputSettings,
      videos: snapshots,
      allow1440p: false,
    });
    const output = built.request.outputs[0];
    t.is(output.limits!.maxWidth, 1920);
    t.is(output.limits!.maxHeight, 1080);
    t.is(output.limits!.maxFpsNum, 60, '1080p/60 testing remains available');
    t.is(output.current.width, 2560, 'request construction must not change saved video settings');
    t.deepEqual(built.attemptContext.outputs[0].limits, output.limits);
    if (display === 'both') {
      t.is(output.additionalVideo!.limits!.maxWidth, 1080);
      t.is(output.additionalVideo!.limits!.maxHeight, 1920);
    }
  }
});

test('another platform caps every ordinary canvas at 6000 Kbps', t => {
  const built = buildAutoOptimizerRequest({
    streamSetup: streamSetup(
      [
        optimizerOutput(),
        optimizerOutput({
          outputId: 'vertical',
          display: 'vertical',
          destinations: [{ platform: 'youtube' }],
          probeCandidates: [
            {
              probeId: 'vertical-youtube',
              kind: 'youtube-unbound',
              outputId: 'vertical',
              platform: 'youtube',
            },
          ],
        }),
      ],
      'dual-output',
    ),
    outputProbes: [],
    outputSettings: { streaming: { ...outputSettings.streaming, bitrate: 8000 } },
    videos: videos(),
    allow1440p: true,
  });
  t.deepEqual(
    built.request.outputs.map(output => output.limits!.maxBitrateKbps),
    [6000, 6000],
  );
  t.deepEqual(
    built.attemptContext.outputs.map(output => output.limits!.maxBitrateKbps),
    [6000, 6000],
  );
});

test('applies platform bitrate limits and prevents estimate or partial promotion', t => {
  const estimated = optimizerOutput({
    destinations: [{ platform: 'tiktok' }],
    probeCandidates: [],
    measurement: 'estimated',
    estimateReason: 'non_twitch',
  });
  const estimatedRequest = buildAutoOptimizerRequest({
    streamSetup: streamSetup([estimated]),
    outputProbes: [],
    outputSettings,
    videos: videos(),
    allow1440p: false,
  }).request.outputs[0];

  t.deepEqual(estimatedRequest.limits, {
    maxBitrateKbps: 6000,
    maxWidth: 1280,
    maxHeight: 720,
    maxFpsNum: 30,
    maxFpsDen: 1,
  });

  const partialRequest = buildAutoOptimizerRequest({
    streamSetup: streamSetup([
      optimizerOutput({
        estimateReason: 'partial_provider_probes',
      }),
    ]),
    outputProbes: [],
    outputSettings,
    videos: videos(),
    allow1440p: false,
  }).request.outputs[0];
  t.deepEqual(partialRequest.limits, {
    maxBitrateKbps: 7500,
    maxWidth: 1280,
    maxHeight: 720,
    maxFpsNum: 30,
    maxFpsDen: 1,
  });
});

test('allows both standard canvases to be benchmarked when only YouTube has a probe', t => {
  const youtube = optimizerOutput({
    outputId: 'vertical',
    display: 'vertical',
    destinations: [{ platform: 'youtube' }],
    probeCandidates: [
      {
        probeId: 'vertical-youtube',
        kind: 'youtube-unbound',
        outputId: 'vertical',
        platform: 'youtube',
      },
    ],
  });
  const kick = optimizerOutput({
    destinations: [{ platform: 'kick' }],
    probeCandidates: [],
    measurement: 'estimated',
  });
  const built = buildAutoOptimizerRequest({
    streamSetup: streamSetup([kick, youtube], 'dual-output'),
    outputProbes: [
      {
        outputId: 'vertical',
        probes: [
          {
            id: 'vertical-youtube',
            kind: 'youtube-unbound',
            server: 'probe-server',
            streamKey: 'probe-key',
          },
        ],
      },
    ],
    outputSettings,
    videos: videos(),
    allow1440p: true,
  });
  t.deepEqual(
    built.request.outputs.map(output => output.limits),
    [
      { maxBitrateKbps: 6000, maxWidth: 1920, maxHeight: 1080, maxFpsNum: 60, maxFpsDen: 1 },
      { maxBitrateKbps: 6000, maxWidth: 1080, maxHeight: 1920, maxFpsNum: 60, maxFpsDen: 1 },
    ],
  );
  t.falsy(built.request.outputs[0].probes?.length);
  t.is(built.request.outputs[1].probes?.length, 1);
});

test('builds paired Enhanced Broadcasting video settings without a Desktop bitrate cap', t => {
  const enhanced = optimizerOutput({
    outputId: 'twitch-enhanced-broadcasting',
    display: 'both',
    outputKind: 'twitch-enhanced-broadcasting',
    probeCandidates: [
      {
        probeId: 'twitch-enhanced-broadcasting-twitch',
        kind: 'twitch-enhanced-broadcasting',
        outputId: 'twitch-enhanced-broadcasting',
        platform: 'twitch',
      },
    ],
  });
  const probe: IAutoOptimizerActiveProbe = {
    id: 'twitch-enhanced-broadcasting-twitch',
    kind: 'twitch-enhanced-broadcasting',
    streamKey: 'private-enhanced-key',
  };
  const built = buildAutoOptimizerRequest({
    streamSetup: streamSetup([enhanced], 'enhanced-broadcasting'),
    outputProbes: [{ outputId: enhanced.outputId, probes: [probe] }],
    outputSettings,
    videos: videos(0, 1),
    allow1440p: true,
  });
  const output = built.request.outputs[0];

  t.deepEqual(output.limits, {
    maxWidth: 2560,
    maxHeight: 1440,
    maxFpsNum: 60,
    maxFpsDen: 1,
  });
  t.deepEqual(output.additionalVideo, {
    display: 'vertical',
    current: {
      canvasId: 1,
      width: 720,
      height: 1280,
      fpsNum: 30,
      fpsDen: 1,
      bitrateKbps: 3000,
      encoderId: 'obs_nvenc_h264_tex',
      preset: 'p5',
    },
    limits: {
      maxWidth: 1080,
      maxHeight: 1920,
      maxFpsNum: 60,
      maxFpsDen: 1,
    },
  });
  t.false(JSON.stringify(built.attemptContext).includes('private-enhanced-key'));
});

test('another selected platform caps every canvas, including Twitch Enhanced Broadcasting', t => {
  const enhanced = optimizerOutput({
    outputId: 'enhanced',
    outputKind: 'twitch-enhanced-broadcasting',
    display: 'both',
  });
  const companion = optimizerOutput({
    outputId: 'horizontal',
    destinations: [{ platform: 'youtube' }],
  });
  const built = buildAutoOptimizerRequest({
    streamSetup: streamSetup([enhanced, companion], 'enhanced-broadcasting-dual-output'),
    outputSettings,
    outputProbes: [],
    videos: videos(),
    allow1440p: true,
  });
  for (const output of built.request.outputs) {
    t.is(output.limits!.maxWidth, 1920);
    t.is(output.limits!.maxHeight, 1080);
  }
});

test('paired requests accept zero-based identities and reject invalid canvas identities', t => {
  const horizontal = optimizerOutput();
  const vertical = optimizerOutput({
    outputId: 'vertical',
    display: 'vertical',
    destinations: [{ platform: 'youtube' }],
    probeCandidates: [
      {
        probeId: 'vertical-youtube',
        kind: 'youtube-unbound',
        outputId: 'vertical',
        platform: 'youtube',
      },
    ],
  });

  const build = (videoSnapshots: ReturnType<typeof videos>) =>
    buildAutoOptimizerRequest({
      streamSetup: streamSetup([horizontal, vertical], 'dual-output'),
      outputProbes: [],
      outputSettings,
      videos: videoSnapshots,
      allow1440p: true,
    });

  t.notThrows(() => build(videos(0, 1)));
  const valid = videos(0, 1);
  const invalid = [
    videos(0, 0),
    { ...valid, horizontal: { ...valid.horizontal, canvasId: undefined } },
    { ...valid, vertical: { ...valid.vertical, canvasId: undefined } },
    { ...valid, horizontal: { ...valid.horizontal, canvasId: -1 } },
    { ...valid, vertical: { ...valid.vertical, canvasId: 1.5 } },
  ];
  invalid.forEach(videoSnapshots => {
    const error = t.throws(() => build(videoSnapshots));
    t.true(error instanceof AutoOptimizerRequestBuildError);
    t.is((error as AutoOptimizerRequestBuildError).code, 'invalid_canvas_identity');
  });
});
