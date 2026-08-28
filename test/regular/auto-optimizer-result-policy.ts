import test from 'ava';
import {
  isValidAutoConfigDualOutputAggregateResult,
  isValidAutoConfigDualOutputResultEnvelope,
  validateAutoConfigRecommendation,
} from '../../app/services/auto-config/result-policy';
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

function dualOutputNativeResult(): IAutoConfigNativeResult {
  return {
    schemaVersion: 1,
    sessionId: 'dual-output-session',
    status: 'complete',
    aggregateUpload: {
      method: 'dual-output-isolated-lower-bound',
      safeVideoKbps: 11600,
      allocatedVideoKbps: 11600,
      concurrentHardwareValidated: true,
    },
    legs: [
      {
        legId: 'horizontal',
        display: 'horizontal',
        destinations: [{ platform: 'twitch' }],
        measurement: {
          mode: 'active',
          confidence: 'high',
          probes: [
            {
              provider: 'twitch',
              method: 'twitch-bandwidth-test',
              measuredKbps: 6013,
              safeKbps: 6000,
              headroomPercent: 0,
              success: true,
            },
          ],
        },
        recommendation: recommendation(),
      },
      {
        legId: 'vertical',
        display: 'vertical',
        destinations: [{ platform: 'youtube' }],
        measurement: {
          mode: 'active',
          confidence: 'high',
          probes: [
            {
              provider: 'youtube',
              method: 'youtube-unbound-ramp',
              measuredKbps: 11620,
              safeKbps: 11600,
              headroomPercent: 0,
              success: true,
            },
          ],
        },
        recommendation: recommendation({ width: 1080, height: 1920 }),
      },
    ],
  };
}

test('two-leg Dual Output requires one valid aggregate upload and hardware proof', t => {
  const expectedLegIds = ['horizontal', 'vertical'];
  t.true(isValidAutoConfigDualOutputAggregateResult(dualOutputNativeResult(), expectedLegIds));

  const missingAggregate = dualOutputNativeResult();
  delete missingAggregate.aggregateUpload;
  t.false(isValidAutoConfigDualOutputAggregateResult(missingAggregate, expectedLegIds));

  const hardwareNotConcurrent = dualOutputNativeResult();
  hardwareNotConcurrent.aggregateUpload!.concurrentHardwareValidated = false;
  t.false(isValidAutoConfigDualOutputAggregateResult(hardwareNotConcurrent, expectedLegIds));

  const overcommitted = dualOutputNativeResult();
  overcommitted.aggregateUpload!.safeVideoKbps = 11599;
  t.false(isValidAutoConfigDualOutputAggregateResult(overcommitted, expectedLegIds));

  const underallocated = dualOutputNativeResult();
  underallocated.aggregateUpload!.allocatedVideoKbps = 11599;
  t.false(isValidAutoConfigDualOutputAggregateResult(underallocated, expectedLegIds));

  const overallocated = dualOutputNativeResult();
  overallocated.aggregateUpload!.safeVideoKbps = 12000;
  overallocated.aggregateUpload!.allocatedVideoKbps = 11700;
  t.false(isValidAutoConfigDualOutputAggregateResult(overallocated, expectedLegIds));

  const allocationExceedsSafe = dualOutputNativeResult();
  allocationExceedsSafe.aggregateUpload!.allocatedVideoKbps = 11601;
  t.false(isValidAutoConfigDualOutputAggregateResult(allocationExceedsSafe, expectedLegIds));

  const wrongMethod = dualOutputNativeResult();
  wrongMethod.aggregateUpload!.method = 'other' as 'dual-output-isolated-lower-bound';
  t.false(isValidAutoConfigDualOutputAggregateResult(wrongMethod, expectedLegIds));

  const wrongProviderSafeValue = dualOutputNativeResult();
  wrongProviderSafeValue.legs[1].measurement.probes![0].safeKbps = 11500;
  t.false(isValidAutoConfigDualOutputAggregateResult(wrongProviderSafeValue, expectedLegIds));

  const wrongProvider = dualOutputNativeResult();
  wrongProvider.legs[1].measurement.probes![0].provider = 'twitch';
  t.false(isValidAutoConfigDualOutputAggregateResult(wrongProvider, expectedLegIds));

  const wrongProbeMethod = dualOutputNativeResult();
  wrongProbeMethod.legs[1].measurement.probes![0].method = 'twitch-bandwidth-test';
  t.false(isValidAutoConfigDualOutputAggregateResult(wrongProbeMethod, expectedLegIds));

  const failedProbe = dualOutputNativeResult();
  failedProbe.legs[1].measurement.probes![0].success = false;
  t.false(isValidAutoConfigDualOutputAggregateResult(failedProbe, expectedLegIds));

  const missingProbe = dualOutputNativeResult();
  missingProbe.legs[1].measurement.probes = [];
  t.false(isValidAutoConfigDualOutputAggregateResult(missingProbe, expectedLegIds));
});

test('two-leg aggregate proof accepts unprobed destinations sharing a measured canvas', t => {
  const result = dualOutputNativeResult();
  result.legs[0].destinations.push({ platform: 'kick' });
  t.true(
    isValidAutoConfigDualOutputAggregateResult(result, ['horizontal', 'vertical']),
  );

  result.legs[0].measurement.probes![0].provider = 'youtube';
  t.false(
    isValidAutoConfigDualOutputAggregateResult(result, ['horizontal', 'vertical']),
  );
});

test('two-leg Dual Output rejects partial legs and divergent joint recommendations', t => {
  const expectedLegIds = ['horizontal', 'vertical'];
  const estimatedLeg = dualOutputNativeResult();
  estimatedLeg.legs[1].measurement.mode = 'estimated';
  t.false(isValidAutoConfigDualOutputAggregateResult(estimatedLeg, expectedLegIds));

  const missingLeg = dualOutputNativeResult();
  missingLeg.legs.pop();
  t.false(isValidAutoConfigDualOutputAggregateResult(missingLeg, expectedLegIds));

  for (const patch of [
    { bitrateKbps: 5700 },
    { fpsNum: 30, fpsDen: 1 },
    { encoderId: 'obs_x264' },
    { encoderFamily: 'x264' },
    { preset: 'p4' },
  ]) {
    const result = dualOutputNativeResult();
    result.legs[1].recommendation = recommendation({
      width: 1080,
      height: 1920,
      ...patch,
    });
    t.false(isValidAutoConfigDualOutputAggregateResult(result, expectedLegIds));
  }
});

test('two-leg Dual Output accepts only a complete low-confidence estimated fallback', t => {
  const expectedLegIds = ['horizontal', 'vertical'];
  const active = dualOutputNativeResult();
  t.true(isValidAutoConfigDualOutputResultEnvelope(active, expectedLegIds));

  const estimated = dualOutputNativeResult();
  delete estimated.aggregateUpload;
  estimated.legs.forEach(leg => {
    leg.measurement.mode = 'estimated';
    leg.measurement.confidence = 'low';
  });
  t.true(isValidAutoConfigDualOutputResultEnvelope(estimated, expectedLegIds));

  const mediumEstimate = dualOutputNativeResult();
  delete mediumEstimate.aggregateUpload;
  mediumEstimate.legs.forEach(leg => {
    leg.measurement.mode = 'estimated';
    leg.measurement.confidence = 'low';
  });
  mediumEstimate.legs[1].measurement.confidence = 'medium';
  t.false(isValidAutoConfigDualOutputResultEnvelope(mediumEstimate, expectedLegIds));

  const partialActive = dualOutputNativeResult();
  partialActive.legs[1].measurement.mode = 'estimated';
  partialActive.legs[1].measurement.confidence = 'low';
  t.false(isValidAutoConfigDualOutputResultEnvelope(partialActive, expectedLegIds));
});

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
    validateAutoConfigRecommendation(recommendation({ fpsNum: 60, fpsDen: 1 }), {
      ...activeContext,
      maxFpsNum: 60,
      maxFpsDen: 1,
      currentWidth: 1920,
      currentHeight: 1080,
      currentFpsNum: 30,
      currentFpsDen: 1,
    }),
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
    validateAutoConfigRecommendation(recommendation({ fpsNum: 60, fpsDen: 1 }), estimated30Context),
    null,
  );
  t.truthy(
    validateAutoConfigRecommendation(recommendation({ fpsNum: 30, fpsDen: 1 }), estimated30Context),
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
  t.is(
    validateAutoConfigRecommendation(recommendation({ bitrateKbps: 6001 }), sharedContext),
    null,
  );
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

test('Twitch quality validation mirrors the joint Dual Output ladder', t => {
  const context = {
    ...activeContext,
    qualityProfile: 'twitch' as const,
    maxFpsNum: 60,
    maxFpsDen: 1,
    currentFpsNum: 60,
    currentFpsDen: 1,
  };
  for (const [bitrateKbps, width, height, fpsNum] of [
    [5500, 1920, 1080, 60],
    [5000, 1920, 1080, 30],
    [4500, 1280, 720, 60],
    [3000, 1280, 720, 30],
  ]) {
    const probeEvidence = context.probeEvidence.map(evidence => ({
      ...evidence,
      measuredKbps: bitrateKbps,
      safeKbps: bitrateKbps,
    }));
    t.truthy(
      validateAutoConfigRecommendation(
        recommendation({ width, height, fpsNum, fpsDen: 1, bitrateKbps }),
        { ...context, probeEvidence },
      ),
      `${bitrateKbps} Kbps validates ${width}x${height} at ${fpsNum} FPS`,
    );
    t.truthy(
      validateAutoConfigRecommendation(
        recommendation({
          width: height,
          height: width,
          fpsNum,
          fpsDen: 1,
          bitrateKbps,
        }),
        {
          ...context,
          probeEvidence,
          maxWidth: 1080,
          maxHeight: 1920,
          currentWidth: 720,
          currentHeight: 1280,
        },
      ),
      `${bitrateKbps} Kbps validates ${height}x${width} at ${fpsNum} FPS`,
    );
  }
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
    validateAutoConfigRecommendation(recommendation({ fpsNum: 120000, fpsDen: 2002 }), {
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

test('paired Enhanced Broadcasting accepts only the exact concurrent horizontal and vertical tuples', t => {
  const additionalVideo = {
    display: 'vertical' as const,
    current: {
      canvasId: 2,
      width: 720,
      height: 1280,
      fpsNum: 30000,
      fpsDen: 1001,
      bitrateKbps: 2500,
      encoderId: 'obs_nvenc_h264_tex',
      codec: 'h264',
    },
    limits: {
      maxWidth: 1080,
      maxHeight: 1920,
      maxFpsNum: 60000,
      maxFpsDen: 1001,
    },
  };
  const pairedRecommendation = recommendation({
    bitrateKbps: 6000,
    encoderFamily: 'provider-owned',
    encoderId: 'provider-owned',
    codec: 'av1',
    preset: undefined,
    additionalVideo: {
      display: 'vertical',
      width: 1080,
      height: 1920,
      fpsNum: 60000,
      fpsDen: 1001,
    },
  });
  const context = {
    ...activeContext,
    providerOwnsEncoding: true,
    enhancedBroadcasting: true,
    additionalVideo,
    probeEvidence: [
      {
        provider: 'twitch' as const,
        method: 'twitch-enhanced-broadcasting-test' as const,
        success: true,
        testedWidth: 1920,
        testedHeight: 1080,
        testedFpsNum: 60000,
        testedFpsDen: 1001,
        testedAdditionalVideo: {
          display: 'vertical' as const,
          width: 1080,
          height: 1920,
          fpsNum: 60000,
          fpsDen: 1001,
        },
      },
    ],
  };

  const result = validateAutoConfigRecommendation(pairedRecommendation, context);
  t.deepEqual(result?.additionalVideo, pairedRecommendation.additionalVideo);
  t.is(result?.encoder, null);
  t.is(
    validateAutoConfigRecommendation(
      { ...pairedRecommendation, additionalVideo: undefined },
      context,
    ),
    null,
  );
  t.is(
    validateAutoConfigRecommendation(pairedRecommendation, {
      ...context,
      probeEvidence: context.probeEvidence.map(evidence => ({
        ...evidence,
        testedAdditionalVideo: { ...evidence.testedAdditionalVideo, width: 720 },
      })),
    }),
    null,
  );
  t.is(
    validateAutoConfigRecommendation(
      {
        ...pairedRecommendation,
        additionalVideo: { ...pairedRecommendation.additionalVideo!, fpsNum: 30000 },
      },
      context,
    ),
    null,
  );
  const nonTransposedAdditionalVideo = {
    ...pairedRecommendation.additionalVideo!,
    width: 720,
    height: 1280,
  };
  t.is(
    validateAutoConfigRecommendation(
      {
        ...pairedRecommendation,
        additionalVideo: nonTransposedAdditionalVideo,
      },
      {
        ...context,
        probeEvidence: context.probeEvidence.map(evidence => ({
          ...evidence,
          testedAdditionalVideo: nonTransposedAdditionalVideo,
        })),
      },
    ),
    null,
  );
});

test('estimate-only paired Enhanced Broadcasting preserves both current canvases', t => {
  const context = {
    ...activeContext,
    measurementMode: 'estimated' as const,
    currentBitrateKbps: 2500,
    currentWidth: 1280,
    currentHeight: 720,
    currentFpsNum: 30,
    currentFpsDen: 1,
    providerOwnsEncoding: true,
    enhancedBroadcasting: true,
    probeEvidence: [] as typeof activeContext.probeEvidence,
    additionalVideo: {
      display: 'vertical' as const,
      current: {
        width: 720,
        height: 1280,
        fpsNum: 30,
        fpsDen: 1,
        bitrateKbps: 2500,
        encoderId: 'obs_nvenc_h264_tex',
        codec: 'h264',
      },
      limits: {
        maxWidth: 1080,
        maxHeight: 1920,
        maxFpsNum: 60,
        maxFpsDen: 1,
      },
    },
  };
  const current = recommendation({
    width: 1280,
    height: 720,
    fpsNum: 30,
    fpsDen: 1,
    bitrateKbps: 2500,
    additionalVideo: {
      display: 'vertical',
      width: 720,
      height: 1280,
      fpsNum: 30,
      fpsDen: 1,
    },
  });

  t.truthy(validateAutoConfigRecommendation(current, context));
  t.is(
    validateAutoConfigRecommendation(
      {
        ...current,
        additionalVideo: { ...current.additionalVideo!, width: 1080, height: 1920 },
      },
      context,
    ),
    null,
  );
});
