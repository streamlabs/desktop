import test from 'ava';
import {
  isValidAutoConfigEnhancedBroadcastingDualOutputResultEnvelope,
  isValidAutoConfigDualOutputAggregateResult,
  isValidAutoConfigDualOutputResultEnvelope,
  validateAutoConfigRecommendation,
} from '../../app/services/auto-config/result-policy';
import {
  IAutoConfigNativeResult,
  IAutoOptimizerTopologyLeg,
} from '../../app/services/auto-config/types';

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
      safeVideoKbps: 10000,
      allocatedVideoKbps: 10000,
      concurrentHardwareValidated: true,
    },
    legs: [
      {
        legId: 'horizontal',
        display: 'horizontal',
        outputKind: 'standard',
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
              ceilingReached: false,
            },
          ],
        },
        recommendation: recommendation({ bitrateKbps: 5000 }),
      },
      {
        legId: 'vertical',
        display: 'vertical',
        outputKind: 'standard',
        destinations: [{ platform: 'youtube' }],
        measurement: {
          mode: 'active',
          confidence: 'high',
          probes: [
            {
              provider: 'youtube',
              method: 'youtube-unbound-ramp',
              measuredKbps: 10020,
              safeKbps: 10000,
              headroomPercent: 0,
              success: true,
              ceilingReached: false,
            },
          ],
        },
        recommendation: recommendation({ width: 1080, height: 1920, bitrateKbps: 5000 }),
      },
    ],
  };
}

const enhancedBroadcastingDualOutputLegs: ReadonlyArray<
  Pick<IAutoOptimizerTopologyLeg, 'legId' | 'display' | 'outputKind'>
> = [
  {
    legId: 'twitch-enhanced-broadcasting',
    display: 'both',
    outputKind: 'twitch-enhanced-broadcasting',
  },
  {
    legId: 'horizontal-standard',
    display: 'horizontal',
    outputKind: 'standard',
  },
];

function enhancedBroadcastingDualOutputNativeResult(
  includeVertical = false,
): IAutoConfigNativeResult {
  const additionalVideo = {
    display: 'vertical' as const,
    width: 1080,
    height: 1920,
    fpsNum: 60,
    fpsDen: 1,
  };
  const companionLegs: IAutoConfigNativeResult['legs'] = [
    {
      legId: 'horizontal-standard',
      display: 'horizontal',
      outputKind: 'standard',
      destinations: [{ platform: 'youtube' }, { platform: 'kick' }],
      measurement: {
        mode: 'active',
        confidence: 'high',
        probes: [
          {
            provider: 'youtube',
            method: 'youtube-unbound-ramp',
            measuredKbps: 6100,
            safeKbps: 6000,
            headroomPercent: 0,
            success: true,
            ceilingReached: false,
          },
        ],
      },
      recommendation: recommendation({ fpsNum: 60, fpsDen: 1, bitrateKbps: 6000 }),
    },
  ];
  if (includeVertical) {
    companionLegs.push({
      legId: 'vertical-standard',
      display: 'vertical',
      outputKind: 'standard',
      destinations: [{ platform: 'youtube' }],
      measurement: {
        mode: 'active',
        confidence: 'high',
        probes: [
          {
            provider: 'youtube',
            method: 'youtube-unbound-ramp',
            measuredKbps: 6100,
            safeKbps: 6000,
            headroomPercent: 0,
            success: true,
            ceilingReached: false,
          },
        ],
      },
      recommendation: recommendation({
        width: 1080,
        height: 1920,
        fpsNum: 60,
        fpsDen: 1,
        bitrateKbps: 6000,
      }),
    });
  }

  return {
    schemaVersion: 1,
    sessionId: 'enhanced-broadcasting-dual-output-session',
    status: 'complete',
    combinedWorkload: {
      method: 'enhanced-broadcasting-dual-output-concurrent',
      enhancedBroadcastingLegId: 'twitch-enhanced-broadcasting',
      validated: true,
      companionLegs: companionLegs.map(leg => ({
        legId: leg.legId,
        display: leg.display as 'horizontal' | 'vertical',
        width: leg.recommendation.width,
        height: leg.recommendation.height,
        fpsNum: leg.recommendation.fpsNum,
        fpsDen: leg.recommendation.fpsDen,
        bitrateKbps: leg.recommendation.bitrateKbps,
        encoderId: leg.recommendation.encoderId,
        preset: leg.recommendation.preset,
      })),
    },
    legs: [
      {
        legId: 'twitch-enhanced-broadcasting',
        display: 'both',
        outputKind: 'twitch-enhanced-broadcasting',
        destinations: [{ platform: 'twitch' }],
        measurement: {
          mode: 'active',
          confidence: 'high',
          probes: [
            {
              provider: 'twitch',
              method: 'twitch-enhanced-broadcasting-test',
              success: true,
              ceilingReached: false,
              testedWidth: 1920,
              testedHeight: 1080,
              testedFpsNum: 60,
              testedFpsDen: 1,
              testedAdditionalVideo: { ...additionalVideo },
              videoTrackCount: 4,
              configuredAggregateBitrateKbps: 10000,
            },
          ],
        },
        recommendation: recommendation({
          fpsNum: 60,
          fpsDen: 1,
          additionalVideo: { ...additionalVideo },
        }),
      },
      ...companionLegs,
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
  ((hardwareNotConcurrent.aggregateUpload as unknown) as {
    concurrentHardwareValidated: boolean;
  }).concurrentHardwareValidated = false;
  t.false(isValidAutoConfigDualOutputAggregateResult(hardwareNotConcurrent, expectedLegIds));

  const overcommitted = dualOutputNativeResult();
  overcommitted.aggregateUpload!.safeVideoKbps = 9999;
  t.false(isValidAutoConfigDualOutputAggregateResult(overcommitted, expectedLegIds));

  const underallocated = dualOutputNativeResult();
  underallocated.aggregateUpload!.allocatedVideoKbps = 9999;
  t.false(isValidAutoConfigDualOutputAggregateResult(underallocated, expectedLegIds));

  const overallocated = dualOutputNativeResult();
  overallocated.aggregateUpload!.safeVideoKbps = 11000;
  overallocated.aggregateUpload!.allocatedVideoKbps = 10100;
  t.false(isValidAutoConfigDualOutputAggregateResult(overallocated, expectedLegIds));

  const allocationExceedsSafe = dualOutputNativeResult();
  allocationExceedsSafe.aggregateUpload!.allocatedVideoKbps = 10001;
  t.false(isValidAutoConfigDualOutputAggregateResult(allocationExceedsSafe, expectedLegIds));

  const wrongMethod = dualOutputNativeResult();
  wrongMethod.aggregateUpload!.method = 'other' as 'dual-output-isolated-lower-bound';
  t.false(isValidAutoConfigDualOutputAggregateResult(wrongMethod, expectedLegIds));

  const wrongProviderSafeValue = dualOutputNativeResult();
  wrongProviderSafeValue.legs[1].measurement.probes![0].safeKbps = 9900;
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
  t.true(isValidAutoConfigDualOutputAggregateResult(result, ['horizontal', 'vertical']));

  result.legs[0].measurement.probes![0].provider = 'youtube';
  t.false(isValidAutoConfigDualOutputAggregateResult(result, ['horizontal', 'vertical']));
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

test('mixed Enhanced Broadcasting accepts an exact concurrent companion workload proof', t => {
  t.true(
    isValidAutoConfigEnhancedBroadcastingDualOutputResultEnvelope(
      enhancedBroadcastingDualOutputNativeResult(),
      enhancedBroadcastingDualOutputLegs,
    ),
  );

  const result = enhancedBroadcastingDualOutputNativeResult(true);
  result.combinedWorkload!.companionLegs.reverse();
  t.true(
    isValidAutoConfigEnhancedBroadcastingDualOutputResultEnvelope(result, [
      ...enhancedBroadcastingDualOutputLegs,
      {
        legId: 'vertical-standard',
        display: 'vertical',
        outputKind: 'standard',
      },
    ]),
    'proof entries form an exact set and do not depend on native ordering',
  );
});

test('mixed Enhanced Broadcasting rejects a missing, unvalidated, or misidentified proof', t => {
  const missing = enhancedBroadcastingDualOutputNativeResult();
  delete missing.combinedWorkload;
  t.false(
    isValidAutoConfigEnhancedBroadcastingDualOutputResultEnvelope(
      missing,
      enhancedBroadcastingDualOutputLegs,
    ),
  );

  const unvalidated = enhancedBroadcastingDualOutputNativeResult();
  ((unvalidated.combinedWorkload as unknown) as { validated: boolean }).validated = false;
  t.false(
    isValidAutoConfigEnhancedBroadcastingDualOutputResultEnvelope(
      unvalidated,
      enhancedBroadcastingDualOutputLegs,
    ),
  );

  const wrongMethod = enhancedBroadcastingDualOutputNativeResult();
  wrongMethod.combinedWorkload!.method = 'unexpected' as typeof wrongMethod.combinedWorkload.method;
  t.false(
    isValidAutoConfigEnhancedBroadcastingDualOutputResultEnvelope(
      wrongMethod,
      enhancedBroadcastingDualOutputLegs,
    ),
  );

  const wrongEnhancedLeg = enhancedBroadcastingDualOutputNativeResult();
  wrongEnhancedLeg.combinedWorkload!.enhancedBroadcastingLegId = 'horizontal-standard';
  t.false(
    isValidAutoConfigEnhancedBroadcastingDualOutputResultEnvelope(
      wrongEnhancedLeg,
      enhancedBroadcastingDualOutputLegs,
    ),
  );
});

test('mixed Enhanced Broadcasting requires an exact unique companion proof set', t => {
  const missing = enhancedBroadcastingDualOutputNativeResult();
  missing.combinedWorkload!.companionLegs = [];
  t.false(
    isValidAutoConfigEnhancedBroadcastingDualOutputResultEnvelope(
      missing,
      enhancedBroadcastingDualOutputLegs,
    ),
  );

  const duplicate = enhancedBroadcastingDualOutputNativeResult();
  duplicate.combinedWorkload!.companionLegs.push({
    ...duplicate.combinedWorkload!.companionLegs[0],
  });
  t.false(
    isValidAutoConfigEnhancedBroadcastingDualOutputResultEnvelope(
      duplicate,
      enhancedBroadcastingDualOutputLegs,
    ),
  );

  const extra = enhancedBroadcastingDualOutputNativeResult();
  extra.combinedWorkload!.companionLegs.push({
    ...extra.combinedWorkload!.companionLegs[0],
    legId: 'vertical-standard',
    display: 'vertical',
    width: 1080,
    height: 1920,
  });
  t.false(
    isValidAutoConfigEnhancedBroadcastingDualOutputResultEnvelope(
      extra,
      enhancedBroadcastingDualOutputLegs,
    ),
  );
});

test('mixed Enhanced Broadcasting proof must exactly match every standard recommendation tuple', t => {
  const mismatches: Array<
    Partial<NonNullable<IAutoConfigNativeResult['combinedWorkload']>['companionLegs'][number]>
  > = [
    { display: 'vertical' },
    { width: 1280 },
    { height: 720 },
    { fpsNum: 30 },
    { fpsDen: 1001 },
    { bitrateKbps: 5900 },
    { encoderId: 'obs_x264' },
    { preset: 'p4' },
  ];

  mismatches.forEach(patch => {
    const result = enhancedBroadcastingDualOutputNativeResult();
    Object.assign(result.combinedWorkload!.companionLegs[0], patch);
    t.false(
      isValidAutoConfigEnhancedBroadcastingDualOutputResultEnvelope(
        result,
        enhancedBroadcastingDualOutputLegs,
      ),
      `accepted mismatched proof ${JSON.stringify(patch)}`,
    );
  });

  const missingPreset = enhancedBroadcastingDualOutputNativeResult();
  delete missingPreset.combinedWorkload!.companionLegs[0].preset;
  t.false(
    isValidAutoConfigEnhancedBroadcastingDualOutputResultEnvelope(
      missingPreset,
      enhancedBroadcastingDualOutputLegs,
    ),
  );
});

test('mixed Enhanced Broadcasting requires one common standard output configuration', t => {
  const mismatches: Array<Partial<IAutoConfigNativeResult['legs'][number]['recommendation']>> = [
    { bitrateKbps: 4500 },
    { encoderId: 'obs_x264', encoderFamily: 'x264' },
    { preset: 'veryfast' },
  ];

  mismatches.forEach(patch => {
    const result = enhancedBroadcastingDualOutputNativeResult(true);
    const vertical = result.legs.find(leg => leg.legId === 'vertical-standard')!;
    Object.assign(vertical.recommendation, patch);
    const proof = result.combinedWorkload!.companionLegs.find(
      leg => leg.legId === 'vertical-standard',
    )!;
    proof.bitrateKbps = vertical.recommendation.bitrateKbps;
    proof.encoderId = vertical.recommendation.encoderId;
    proof.preset = vertical.recommendation.preset;

    t.false(
      isValidAutoConfigEnhancedBroadcastingDualOutputResultEnvelope(
        result,
        enhancedBroadcastingDualOutputLegs.concat({
          legId: 'vertical-standard',
          display: 'vertical',
          outputKind: 'standard',
        }),
      ),
    );
  });
});

test('mixed Enhanced Broadcasting requires exact successful paired Twitch evidence', t => {
  const failed = enhancedBroadcastingDualOutputNativeResult();
  failed.legs[0].measurement.probes![0].success = false;
  t.false(
    isValidAutoConfigEnhancedBroadcastingDualOutputResultEnvelope(
      failed,
      enhancedBroadcastingDualOutputLegs,
    ),
  );

  const mismatchedPrimary = enhancedBroadcastingDualOutputNativeResult();
  mismatchedPrimary.legs[0].measurement.probes![0].testedWidth = 1280;
  t.false(
    isValidAutoConfigEnhancedBroadcastingDualOutputResultEnvelope(
      mismatchedPrimary,
      enhancedBroadcastingDualOutputLegs,
    ),
  );

  const missingAdditional = enhancedBroadcastingDualOutputNativeResult();
  delete missingAdditional.legs[0].measurement.probes![0].testedAdditionalVideo;
  t.false(
    isValidAutoConfigEnhancedBroadcastingDualOutputResultEnvelope(
      missingAdditional,
      enhancedBroadcastingDualOutputLegs,
    ),
  );

  const mismatchedAdditional = enhancedBroadcastingDualOutputNativeResult();
  mismatchedAdditional.legs[0].measurement.probes![0].testedAdditionalVideo!.width = 720;
  t.false(
    isValidAutoConfigEnhancedBroadcastingDualOutputResultEnvelope(
      mismatchedAdditional,
      enhancedBroadcastingDualOutputLegs,
    ),
  );
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

test('combined workload promotion requires successful companion bandwidth evidence', t => {
  const combinedContext = {
    ...activeContext,
    combinedWorkloadValidated: true,
    maxFpsNum: 60,
    maxFpsDen: 1,
    currentFpsNum: 30,
    currentFpsDen: 1,
  };
  const promoted = recommendation({ fpsNum: 60, fpsDen: 1 });

  t.is(
    validateAutoConfigRecommendation(promoted, {
      ...combinedContext,
      measurementMode: 'estimated',
      probeEvidence: [],
    }),
    null,
    'an unsupported-only companion cannot promote from hardware proof alone',
  );
  t.is(
    validateAutoConfigRecommendation(promoted, {
      ...combinedContext,
      probeEvidence: [
        {
          provider: 'youtube',
          method: 'youtube-unbound-ramp',
          safeKbps: 6000,
          success: false,
        },
      ],
    }),
    null,
    'a failed supported probe cannot authorize promotion',
  );
  t.is(
    validateAutoConfigRecommendation(promoted, {
      ...combinedContext,
      probeEvidence: [
        {
          provider: 'youtube',
          method: 'youtube-unbound-ramp',
          safeKbps: promoted.bitrateKbps - 1,
          success: true,
        },
      ],
    }),
    null,
    'successful evidence below the recommendation bitrate is insufficient',
  );
  t.truthy(
    validateAutoConfigRecommendation(promoted, {
      ...combinedContext,
      probeEvidence: [
        {
          provider: 'youtube',
          method: 'youtube-unbound-ramp',
          safeKbps: promoted.bitrateKbps,
          success: true,
        },
      ],
    }),
    'the exact supported active proof authorizes the jointly tested promotion',
  );
});

test('unsupported combined companions may retain or lower their current tuple', t => {
  const context = {
    ...activeContext,
    measurementMode: 'estimated' as const,
    combinedWorkloadValidated: true,
    currentBitrateKbps: 2500,
    probeEvidence: [] as typeof activeContext.probeEvidence,
    maxFpsNum: 60,
    maxFpsDen: 1,
    currentFpsNum: 30,
    currentFpsDen: 1,
  };

  t.truthy(
    validateAutoConfigRecommendation(
      recommendation({
        width: 1280,
        height: 720,
        fpsNum: 30,
        fpsDen: 1,
        bitrateKbps: 2500,
      }),
      context,
    ),
  );
  t.truthy(
    validateAutoConfigRecommendation(
      recommendation({
        width: 960,
        height: 540,
        fpsNum: 30,
        fpsDen: 1,
        bitrateKbps: 2000,
      }),
      context,
    ),
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

test('a 10000 Kbps stability probe can produce only an 8000 Kbps recommendation', t => {
  const context = {
    ...activeContext,
    maxBitrateKbps: 8000,
    probeEvidence: [
      {
        provider: 'youtube' as const,
        method: 'youtube-unbound-ramp' as const,
        measuredKbps: 10000,
        safeKbps: 10000,
        headroomPercent: 0,
        success: true,
      },
    ],
  };

  t.truthy(validateAutoConfigRecommendation(recommendation({ bitrateKbps: 8000 }), context));
  t.is(validateAutoConfigRecommendation(recommendation({ bitrateKbps: 8001 }), context), null);
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
      bitrateKbps: 10000,
      preset: undefined,
    }),
    {
      ...activeContext,
      providerOwnsEncoding: true,
      enhancedBroadcasting: true,
      maxBitrateKbps: 8000,
      probeEvidence: [
        {
          provider: 'twitch',
          method: 'twitch-enhanced-broadcasting-test',
          success: true,
          testedWidth: 1920,
          testedHeight: 1080,
          testedFpsNum: 60000,
          testedFpsDen: 1001,
        },
      ],
    },
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
