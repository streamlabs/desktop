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
    maxBitrateKbps: 8000,
    maxWidth: 1920,
    maxHeight: 1080,
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
  }).request.outputs[0];
  t.deepEqual(partialRequest.limits, {
    maxBitrateKbps: 8000,
    maxWidth: 1280,
    maxHeight: 720,
    maxFpsNum: 30,
    maxFpsDen: 1,
  });
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
  });
  const output = built.request.outputs[0];

  t.deepEqual(output.limits, {
    maxWidth: 1920,
    maxHeight: 1080,
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
