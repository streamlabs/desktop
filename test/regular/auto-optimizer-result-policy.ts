import test from 'ava';
import { validateAutoConfigRecommendation } from '../../app/services/auto-config/result-policy';
import { IAutoConfigNativeResult } from '../../app/services/auto-config/types';

type TRecommendation = IAutoConfigNativeResult['legs'][number]['recommendation'];

function recommendation(patch: Partial<TRecommendation> = {}): TRecommendation {
  return {
    width: 1920,
    height: 1080,
    fpsNum: 60000,
    fpsDen: 1001,
    bitrateKbps: 5800,
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
  currentBitrateKbps: 2500,
  probeEvidence: [
    {
      provider: 'twitch' as const,
      method: 'twitch-bandwidth-test' as const,
      measuredKbps: 6013,
      safeKbps: 6000,
      headroomPercent: 0,
      success: true,
    },
  ],
  maxWidth: 1920,
  maxHeight: 1080,
  maxFpsNum: 60000,
  maxFpsDen: 1001,
  currentWidth: 1280,
  currentHeight: 720,
  currentFpsNum: 60000,
  currentFpsDen: 1001,
};

test('an exact modern H.264 recommendation is preserved as one tuple', t => {
  t.deepEqual(validateAutoConfigRecommendation(recommendation(), activeContext), {
    width: 1920,
    height: 1080,
    fpsNum: 60000,
    fpsDen: 1001,
    bitrateKbps: 5800,
    encoder: {
      id: 'obs_nvenc_h264_tex',
      family: 'obs_nvenc_h264_tex',
      title: 'NVIDIA NVENC H.264',
      codec: 'h264',
      preset: 'p5',
    },
  });
});

test('active validation accepts a tested 30 to 60 FPS promotion', t => {
  t.truthy(
    validateAutoConfigRecommendation(
      recommendation({ fpsNum: 60, fpsDen: 1 }),
      {
        ...activeContext,
        maxFpsNum: 60,
        maxFpsDen: 1,
        currentWidth: 1920,
        currentHeight: 1080,
        currentFpsNum: 30,
        currentFpsDen: 1,
      },
    ),
  );
});

test('estimate-only validation rejects an FPS promotion and preserves current cadence', t => {
  const estimated30Context = {
    measurementMode: 'estimated' as const,
    currentBitrateKbps: 5800,
    probeEvidence: [] as [],
    maxWidth: 1920,
    maxHeight: 1080,
    maxFpsNum: 30,
    maxFpsDen: 1,
    currentWidth: 1920,
    currentHeight: 1080,
    currentFpsNum: 30,
    currentFpsDen: 1,
  };
  t.is(
    validateAutoConfigRecommendation(
      recommendation({ fpsNum: 60, fpsDen: 1 }),
      estimated30Context,
    ),
    null,
  );
  t.truthy(
    validateAutoConfigRecommendation(
      recommendation({ fpsNum: 30, fpsDen: 1 }),
      estimated30Context,
    ),
  );
});

test('estimated recommendations cannot independently raise bitrate', t => {
  t.is(
    validateAutoConfigRecommendation(recommendation({ bitrateKbps: 2501 }), {
      measurementMode: 'estimated',
      currentBitrateKbps: 2500,
      probeEvidence: [],
    }),
    null,
  );
});

test('estimated recommendations cannot independently raise resolution', t => {
  t.is(
    validateAutoConfigRecommendation(recommendation({ bitrateKbps: 2500 }), {
      ...activeContext,
      measurementMode: 'estimated',
      probeEvidence: [],
    }),
    null,
  );
});

test('estimate-only validation preserves the exact high current tuple from the request', t => {
  t.truthy(
    validateAutoConfigRecommendation(
      recommendation({
        width: 2560,
        height: 1440,
        fpsNum: 60,
        fpsDen: 1,
        bitrateKbps: 2500,
      }),
      {
        measurementMode: 'estimated',
        currentBitrateKbps: 2500,
        probeEvidence: [],
        maxWidth: 2560,
        maxHeight: 1440,
        maxFpsNum: 60,
        maxFpsDen: 1,
        currentWidth: 2560,
        currentHeight: 1440,
        currentFpsNum: 60,
        currentFpsDen: 1,
      },
    ),
  );
});

test('active recommendations cannot exceed the lowest successful safe result', t => {
  t.is(
    validateAutoConfigRecommendation(recommendation({ bitrateKbps: 6001 }), activeContext),
    null,
  );
  t.truthy(validateAutoConfigRecommendation(recommendation({ bitrateKbps: 6000 }), activeContext));
});

test('a shared Twitch and YouTube result keeps the lower validated provider target', t => {
  const sharedContext = {
    ...activeContext,
    probeEvidence: [
      ...activeContext.probeEvidence,
      {
        provider: 'youtube' as const,
        method: 'youtube-unbound-ramp' as const,
        measuredKbps: 7900,
        safeKbps: 8000,
        headroomPercent: 0,
        success: true,
      },
    ],
  };

  t.truthy(validateAutoConfigRecommendation(recommendation({ bitrateKbps: 6000 }), sharedContext));
  t.is(validateAutoConfigRecommendation(recommendation({ bitrateKbps: 6001 }), sharedContext), null);
});

test('malformed geometry rejects the entire recommendation', t => {
  t.is(validateAutoConfigRecommendation(recommendation({ width: 1919 }), activeContext), null);
  t.is(validateAutoConfigRecommendation(recommendation({ fpsDen: 0 }), activeContext), null);
});

test('recommendations cannot exceed the tested canvas or frame-rate ceiling', t => {
  t.is(
    validateAutoConfigRecommendation(recommendation({ width: 2560, height: 1440 }), activeContext),
    null,
  );
  t.is(
    validateAutoConfigRecommendation(recommendation({ fpsNum: 60, fpsDen: 1 }), activeContext),
    null,
  );
  t.truthy(validateAutoConfigRecommendation(recommendation(), activeContext));
});

test('recommendation must match native quality selection for its safe bitrate', t => {
  t.is(
    validateAutoConfigRecommendation(recommendation({ bitrateKbps: 4000 }), activeContext),
    null,
  );
  t.truthy(
    validateAutoConfigRecommendation(
      recommendation({
        width: 960,
        height: 540,
        fpsNum: 30000,
        fpsDen: 1001,
        bitrateKbps: 1,
      }),
      activeContext,
    ),
  );
});

test('legacy and non-H.264 encoders are rejected', t => {
  t.is(
    validateAutoConfigRecommendation(
      recommendation({ encoderFamily: 'qsv', encoderId: 'obs_qsv11' }),
      activeContext,
    ),
    null,
  );
  t.is(
    validateAutoConfigRecommendation(
      recommendation({ codec: 'av1' as 'h264', encoderId: 'obs_nvenc_av1_tex' }),
      activeContext,
    ),
    null,
  );
  t.is(
    validateAutoConfigRecommendation(recommendation({ preset: 'legacy-default' }), activeContext),
    null,
  );
  t.is(
    validateAutoConfigRecommendation(recommendation({ preset: undefined }), activeContext),
    null,
  );
});

test('tested Apple H.264 implementations are accepted explicitly', t => {
  t.truthy(
    validateAutoConfigRecommendation(
      recommendation({
        encoderFamily: 'apple',
        encoderId: 'com.apple.videotoolbox.videoencoder.ave.avc',
        encoderTitle: 'Apple VT H264 Hardware Encoder',
        width: 1280,
        height: 720,
        preset: 'high',
      }),
      activeContext,
    ),
  );
});

test('provider-managed encoding does not reject an otherwise valid tuple by codec', t => {
  const result = validateAutoConfigRecommendation(
    recommendation({
      encoderFamily: 'obs_nvenc_av1_tex',
      encoderId: 'obs_nvenc_av1_tex',
      encoderTitle: 'NVIDIA NVENC AV1',
      codec: 'av1',
      preset: undefined,
    }),
    { ...activeContext, providerOwnsEncoding: true },
  );
  t.truthy(result);
  t.is(result?.encoder, null);
});

test('Enhanced Broadcasting accepts only the exact actively tested video tuple', t => {
  const enhancedContext = {
    ...activeContext,
    providerOwnsEncoding: true,
    enhancedBroadcasting: true,
    probeEvidence: [
      {
        provider: 'twitch' as const,
        method: 'twitch-enhanced-broadcasting-test' as const,
        success: true,
        testedWidth: 1920,
        testedHeight: 1080,
        testedFpsNum: 60000,
        testedFpsDen: 1001,
        videoTrackCount: 3,
        configuredAggregateBitrateKbps: 7800,
      },
    ],
  };

  const result = validateAutoConfigRecommendation(
    recommendation({
      bitrateKbps: 6000,
      encoderFamily: 'provider-owned',
      encoderId: 'provider-owned',
      codec: 'av1',
      preset: undefined,
    }),
    enhancedContext,
  );
  t.truthy(result);
  t.is(result?.encoder, null);
  t.is(
    validateAutoConfigRecommendation(
      recommendation({ width: 1280, height: 720, bitrateKbps: 6000 }),
      enhancedContext,
    ),
    null,
  );
  t.is(
    validateAutoConfigRecommendation(recommendation({ bitrateKbps: 6000 }), {
      ...enhancedContext,
      probeEvidence: activeContext.probeEvidence,
    }),
    null,
  );
});

test('Enhanced Broadcasting rejects non-canonical and non-exact cadence tuples', t => {
  const context = {
    ...activeContext,
    providerOwnsEncoding: true,
    enhancedBroadcasting: true,
  };

  t.is(
    validateAutoConfigRecommendation(
      recommendation({ width: 1600, height: 900, fpsNum: 48, fpsDen: 1 }),
      {
        ...context,
        probeEvidence: [
          {
            provider: 'twitch',
            method: 'twitch-enhanced-broadcasting-test',
            success: true,
            testedWidth: 1600,
            testedHeight: 900,
            testedFpsNum: 48,
            testedFpsDen: 1,
          },
        ],
      },
    ),
    null,
  );
  t.is(
    validateAutoConfigRecommendation(
      recommendation({ fpsNum: 120000, fpsDen: 2002 }),
      {
        ...context,
        probeEvidence: [
          {
            provider: 'twitch',
            method: 'twitch-enhanced-broadcasting-test',
            success: true,
            testedWidth: 1920,
            testedHeight: 1080,
            testedFpsNum: 120000,
            testedFpsDen: 2002,
          },
        ],
      },
    ),
    null,
  );
  t.is(
    validateAutoConfigRecommendation(recommendation(), {
      ...context,
      probeEvidence: [
        {
          provider: 'twitch',
          method: 'twitch-enhanced-broadcasting-test',
          success: true,
          testedWidth: 1920,
          testedHeight: 1080,
          testedFpsNum: 120000,
          testedFpsDen: 2002,
        },
      ],
    }),
    null,
  );
});

test('estimate-only Enhanced Broadcasting cannot promote video settings', t => {
  t.is(
    validateAutoConfigRecommendation(recommendation({ bitrateKbps: 2500 }), {
      ...activeContext,
      measurementMode: 'estimated',
      currentBitrateKbps: 2500,
      probeEvidence: [],
      providerOwnsEncoding: true,
      enhancedBroadcasting: true,
    }),
    null,
  );
  t.is(
    validateAutoConfigRecommendation(
      recommendation({
        width: 1280,
        height: 720,
        fpsNum: 60,
        fpsDen: 1,
        bitrateKbps: 2500,
      }),
      {
        ...activeContext,
        measurementMode: 'estimated',
        currentBitrateKbps: 2500,
        probeEvidence: [],
        providerOwnsEncoding: true,
        enhancedBroadcasting: true,
        currentWidth: 1280,
        currentHeight: 720,
        currentFpsNum: 30,
        currentFpsDen: 1,
      },
    ),
    null,
  );
});
