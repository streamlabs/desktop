import test from 'ava';
import {
  IAutoOptimizerRecommendationCandidate,
  validateAutoOptimizerRecommendation,
} from '../../app/services/auto-optimizer/result-policy';

function recommendation(
  patch: Partial<IAutoOptimizerRecommendationCandidate> = {},
): IAutoOptimizerRecommendationCandidate {
  return {
    width: 1920,
    height: 1080,
    fpsNum: 60,
    fpsDen: 1,
    bitrateKbps: 6000,
    encoderId: 'obs_nvenc_h264_tex',
    encoderFamily: 'obs_nvenc_h264_tex',
    encoderTitle: 'NVIDIA NVENC H.264',
    codec: 'h264',
    preset: 'p5',
    ...patch,
  };
}

const activeContext = {
  measurementMode: 'active' as const,
  currentBitrateKbps: 3000,
  probeEvidence: [
    {
      platform: 'twitch' as const,
      method: 'twitch-bandwidth-test' as const,
      success: true,
    },
  ],
  qualityProfile: 'twitch' as const,
  maxBitrateKbps: 8000,
  maxWidth: 1920,
  maxHeight: 1080,
  maxFpsNum: 60,
  maxFpsDen: 1,
  currentWidth: 1280,
  currentHeight: 720,
  currentFpsNum: 30,
  currentFpsDen: 1,
};

test('a valid modern H.264 recommendation is preserved as one settings set', t => {
  t.deepEqual(validateAutoOptimizerRecommendation(recommendation(), activeContext), {
    width: 1920,
    height: 1080,
    fpsNum: 60,
    fpsDen: 1,
    bitrateKbps: 6000,
    encoder: {
      id: 'obs_nvenc_h264_tex',
      family: 'obs_nvenc_h264_tex',
      title: 'NVIDIA NVENC H.264',
      codec: 'h264',
      preset: 'p5',
    },
  });
});

test('an active standard recommendation requires successful platform evidence', t => {
  t.is(
    validateAutoOptimizerRecommendation(recommendation(), {
      ...activeContext,
      probeEvidence: [{ platform: 'twitch', method: 'twitch-bandwidth-test', success: false }],
    }),
    null,
  );
  t.is(
    validateAutoOptimizerRecommendation(recommendation(), { ...activeContext, probeEvidence: [] }),
    null,
  );
});

test('Desktop enforces its absolute and request-specific bitrate ceilings', t => {
  t.is(
    validateAutoOptimizerRecommendation(recommendation({ bitrateKbps: 8100 }), activeContext),
    null,
  );
  t.is(
    validateAutoOptimizerRecommendation(recommendation({ bitrateKbps: 6000 }), {
      ...activeContext,
      maxBitrateKbps: 5000,
    }),
    null,
  );
  t.truthy(
    validateAutoOptimizerRecommendation(recommendation({ bitrateKbps: 8000 }), activeContext),
  );
});

test('estimated recommendations cannot promote bitrate, resolution, or frame rate', t => {
  const estimated = {
    ...activeContext,
    measurementMode: 'estimated' as const,
    currentBitrateKbps: 3000,
    probeEvidence: [] as typeof activeContext.probeEvidence,
  };
  t.is(validateAutoOptimizerRecommendation(recommendation(), estimated), null);
  t.is(
    validateAutoOptimizerRecommendation(
      recommendation({ width: 1280, height: 720, fpsNum: 30, bitrateKbps: 3100 }),
      estimated,
    ),
    null,
  );
  t.is(
    validateAutoOptimizerRecommendation(
      recommendation({ width: 1280, height: 720, fpsNum: 60, bitrateKbps: 3000 }),
      estimated,
    ),
    null,
  );
  t.truthy(
    validateAutoOptimizerRecommendation(
      recommendation({ width: 1280, height: 720, fpsNum: 30, bitrateKbps: 3000 }),
      estimated,
    ),
  );
});

test('malformed geometry and values outside attempted ceilings are rejected', t => {
  t.is(validateAutoOptimizerRecommendation(recommendation({ width: 1919 }), activeContext), null);
  t.is(validateAutoOptimizerRecommendation(recommendation({ height: 1082 }), activeContext), null);
  t.is(validateAutoOptimizerRecommendation(recommendation({ fpsNum: 61 }), activeContext), null);
  t.is(validateAutoOptimizerRecommendation(recommendation({ fpsDen: 0 }), activeContext), null);
});

test('only tested, applicable H.264 encoder configurations are accepted', t => {
  t.is(validateAutoOptimizerRecommendation(recommendation({ codec: 'hevc' }), activeContext), null);
  t.is(
    validateAutoOptimizerRecommendation(recommendation({ encoderId: 'jim_nvenc' }), activeContext),
    null,
  );
  t.is(validateAutoOptimizerRecommendation(recommendation({ preset: 'p7' }), activeContext), null);
  t.truthy(
    validateAutoOptimizerRecommendation(
      recommendation({
        encoderId: 'com.apple.videotoolbox.videoencoder.ave.avc',
        encoderFamily: 'apple',
        encoderTitle: 'Apple VT H.264',
        preset: 'high',
      }),
      activeContext,
    ),
  );
});

test('Twitch Enhanced Broadcasting accepts only video settings validated by its workload test', t => {
  const twitchManagedContext = {
    ...activeContext,
    twitchManagesEncoding: true,
    enhancedBroadcasting: true,
    probeEvidence: [
      {
        platform: 'twitch' as const,
        method: 'twitch-enhanced-broadcasting-test' as const,
        success: true,
      },
    ],
  };
  const twitchManagedRecommendation = recommendation({
    bitrateKbps: 3000,
    encoderId: undefined,
    encoderFamily: undefined,
    encoderTitle: undefined,
    codec: undefined,
    preset: undefined,
  });
  const valid = validateAutoOptimizerRecommendation(
    twitchManagedRecommendation,
    twitchManagedContext,
  );
  t.truthy(valid);
  t.is(valid?.encoder, null);
  t.is(
    validateAutoOptimizerRecommendation(
      { ...twitchManagedRecommendation, width: 1600, height: 900 },
      twitchManagedContext,
    ),
    null,
  );
  t.is(
    validateAutoOptimizerRecommendation(twitchManagedRecommendation, {
      ...twitchManagedContext,
      probeEvidence: [],
    }),
    null,
  );
});

function pairedAdditionalVideo() {
  return {
    display: 'vertical' as const,
    current: {
      width: 720,
      height: 1280,
      fpsNum: 30,
      fpsDen: 1,
      bitrateKbps: 3000,
      encoderId: 'obs_nvenc_h264_tex',
    },
    limits: {
      maxBitrateKbps: 8000,
      maxWidth: 1080,
      maxHeight: 1920,
      maxFpsNum: 60,
      maxFpsDen: 1,
    },
  };
}

test('paired Enhanced Broadcasting validates transposed horizontal and vertical settings', t => {
  const context = {
    ...activeContext,
    twitchManagesEncoding: true,
    enhancedBroadcasting: true,
    probeEvidence: [
      {
        platform: 'twitch' as const,
        method: 'twitch-enhanced-broadcasting-test' as const,
        success: true,
      },
    ],
    additionalVideo: pairedAdditionalVideo(),
  };
  const candidate = recommendation({
    bitrateKbps: 3000,
    additionalVideo: {
      display: 'vertical',
      width: 1080,
      height: 1920,
      fpsNum: 60,
      fpsDen: 1,
    },
  });
  t.truthy(validateAutoOptimizerRecommendation(candidate, context));
  t.is(
    validateAutoOptimizerRecommendation(
      { ...candidate, additionalVideo: { ...candidate.additionalVideo!, fpsNum: 30 } },
      context,
    ),
    null,
  );
  t.is(
    validateAutoOptimizerRecommendation(
      {
        ...candidate,
        additionalVideo: { ...candidate.additionalVideo!, width: 720, height: 1280 },
      },
      context,
    ),
    null,
  );
});

test('estimate-only paired Enhanced Broadcasting preserves both current canvases', t => {
  const context = {
    ...activeContext,
    measurementMode: 'estimated' as const,
    twitchManagesEncoding: true,
    enhancedBroadcasting: true,
    probeEvidence: [] as typeof activeContext.probeEvidence,
    additionalVideo: pairedAdditionalVideo(),
  };
  t.truthy(
    validateAutoOptimizerRecommendation(
      recommendation({
        width: 1280,
        height: 720,
        fpsNum: 30,
        bitrateKbps: 3000,
        additionalVideo: {
          display: 'vertical',
          width: 720,
          height: 1280,
          fpsNum: 30,
          fpsDen: 1,
        },
      }),
      context,
    ),
  );
  t.is(
    validateAutoOptimizerRecommendation(
      recommendation({
        bitrateKbps: 3000,
        additionalVideo: {
          display: 'vertical',
          width: 1080,
          height: 1920,
          fpsNum: 60,
          fpsDen: 1,
        },
      }),
      context,
    ),
    null,
  );
});
