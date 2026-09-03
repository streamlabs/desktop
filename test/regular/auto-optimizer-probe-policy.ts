import test from 'ava';
import {
  autoOptimizerPhaseStepDisposition,
  autoOptimizerPhaseStepKey,
  isEligibleAutoOptimizerDualOutputActiveStreamSetup,
  isEligibleAutoOptimizerEnhancedBroadcastingDualOutputStreamSetup,
  isValidAutoOptimizerActiveProbeCoverage,
  prepareAutoOptimizerStreamSetup,
  sanitizeAutoOptimizerProgressDetail,
  sanitizeAutoOptimizerProbeEvidence,
} from '../../app/services/auto-optimizer/probe-policy';
import {
  IAutoOptimizerEvent,
  IAutoOptimizerStreamSetup,
} from '../../app/services/auto-optimizer/types';

function allProbeCandidates(streamSetup: IAutoOptimizerStreamSetup) {
  return streamSetup.outputs.flatMap(output => output.probeCandidates);
}

function twitchYoutubeDualOutputStreamSetup(): IAutoOptimizerStreamSetup {
  const outputs = ['twitch', 'youtube'].map((platform, index) => ({
    outputId: index ? 'vertical' : 'horizontal',
    display: index ? ('vertical' as const) : ('horizontal' as const),
    outputKind: 'standard' as const,
    destinations: [{ platform: platform as 'twitch' | 'youtube' }],
    probeCandidates: [
      {
        probeId: `${index ? 'vertical' : 'horizontal'}-${platform}`,
        kind: platform === 'twitch' ? ('twitch-standard' as const) : ('youtube-unbound' as const),
        outputId: index ? 'vertical' : 'horizontal',
        platform: platform as 'twitch' | 'youtube',
      },
    ],
    measurement: 'active' as const,
  }));
  return {
    type: 'dual-output',
    outputs,
  };
}

function twitchKickYoutubeDualOutputStreamSetup(): IAutoOptimizerStreamSetup {
  const streamSetup = twitchYoutubeDualOutputStreamSetup();
  streamSetup.outputs[0].destinations.push({ platform: 'kick' });
  return streamSetup;
}

function sharedCloudStreamSetup(): IAutoOptimizerStreamSetup {
  const probeCandidates = [
    {
      probeId: 'horizontal-twitch',
      kind: 'twitch-standard' as const,
      outputId: 'horizontal',
      platform: 'twitch' as const,
    },
    {
      probeId: 'horizontal-youtube',
      kind: 'youtube-unbound' as const,
      outputId: 'horizontal',
      platform: 'youtube' as const,
    },
  ];
  return {
    type: 'cloud-multistream',
    outputs: [
      {
        outputId: 'horizontal',
        display: 'horizontal',
        outputKind: 'standard',
        destinations: [{ platform: 'twitch' }, { platform: 'youtube' }],
        probeCandidates,
        measurement: 'active',
      },
    ],
  };
}

function enhancedBroadcastingDualOutputStreamSetup(): IAutoOptimizerStreamSetup {
  const enhancedCandidate = {
    probeId: 'twitch-enhanced-broadcasting-twitch',
    kind: 'twitch-enhanced-broadcasting' as const,
    outputId: 'twitch-enhanced-broadcasting',
    platform: 'twitch' as const,
  };
  const youtubeCandidate = {
    probeId: 'horizontal-standard-youtube',
    kind: 'youtube-unbound' as const,
    outputId: 'horizontal-standard',
    platform: 'youtube' as const,
  };
  return {
    type: 'enhanced-broadcasting-dual-output',
    outputs: [
      {
        outputId: 'twitch-enhanced-broadcasting',
        display: 'both',
        outputKind: 'twitch-enhanced-broadcasting',
        destinations: [{ platform: 'twitch' }],
        probeCandidates: [enhancedCandidate],
        measurement: 'active',
      },
      {
        outputId: 'horizontal-standard',
        display: 'horizontal',
        outputKind: 'standard',
        destinations: [{ platform: 'youtube' }, { platform: 'kick' }],
        probeCandidates: [youtubeCandidate],
        measurement: 'active',
      },
    ],
  };
}

test('mixed Enhanced Broadcasting keeps only its Twitch and YouTube representatives', t => {
  const streamSetup = enhancedBroadcastingDualOutputStreamSetup();
  t.true(isEligibleAutoOptimizerEnhancedBroadcastingDualOutputStreamSetup(streamSetup));

  const filtered = prepareAutoOptimizerStreamSetup(streamSetup);

  t.true(isEligibleAutoOptimizerEnhancedBroadcastingDualOutputStreamSetup(filtered));
  t.deepEqual(
    filtered.outputs.map(output => ({
      outputKind: output.outputKind,
      destinations: output.destinations.map(destination => destination.platform),
      probePlatforms: output.probeCandidates.map(candidate => candidate.platform),
      measurement: output.measurement,
    })),
    [
      {
        outputKind: 'twitch-enhanced-broadcasting',
        destinations: ['twitch'],
        probePlatforms: ['twitch'],
        measurement: 'active',
      },
      {
        outputKind: 'standard',
        destinations: ['youtube', 'kick'],
        probePlatforms: ['youtube'],
        measurement: 'active',
      },
    ],
  );
});

test('a two-canvas Twitch and YouTube setup keeps one active probe per output', t => {
  const streamSetup = twitchYoutubeDualOutputStreamSetup();
  t.true(isEligibleAutoOptimizerDualOutputActiveStreamSetup(streamSetup));

  const filtered = prepareAutoOptimizerStreamSetup(streamSetup);
  t.deepEqual(
    filtered.outputs.map(output => [
      output.display,
      output.probeCandidates[0]?.platform,
      output.measurement,
    ]),
    [
      ['horizontal', 'twitch', 'active'],
      ['vertical', 'youtube', 'active'],
    ],
  );
  t.deepEqual(
    allProbeCandidates(filtered).map(candidate => candidate.platform),
    ['twitch', 'youtube'],
  );
});

test('Dual Output keeps one supported probe per canvas when other platforms share it', t => {
  const streamSetup = twitchKickYoutubeDualOutputStreamSetup();
  t.true(isEligibleAutoOptimizerDualOutputActiveStreamSetup(streamSetup));

  const filtered = prepareAutoOptimizerStreamSetup(streamSetup);
  t.deepEqual(
    filtered.outputs.map(output => ({
      destinations: output.destinations.map(destination => destination.platform),
      probePlatforms: output.probeCandidates.map(candidate => candidate.platform),
      measurement: output.measurement,
      estimateReason: output.estimateReason,
    })),
    [
      {
        destinations: ['twitch', 'kick'],
        probePlatforms: ['twitch'],
        measurement: 'active',
        estimateReason: undefined,
      },
      {
        destinations: ['youtube'],
        probePlatforms: ['youtube'],
        measurement: 'active',
        estimateReason: undefined,
      },
    ],
  );
});

test('Dual Output selects distinct supported representatives when a canvas has both', t => {
  const streamSetup = twitchKickYoutubeDualOutputStreamSetup();
  streamSetup.outputs[0].destinations.splice(1, 0, { platform: 'youtube' });
  streamSetup.outputs[0].probeCandidates.push({
    probeId: 'horizontal-youtube',
    kind: 'youtube-unbound',
    outputId: 'horizontal',
    platform: 'youtube',
  });

  const filtered = prepareAutoOptimizerStreamSetup(streamSetup);
  t.deepEqual(
    filtered.outputs.map(output => output.probeCandidates.map(candidate => candidate.platform)),
    [['twitch'], ['youtube']],
  );
  t.true(isEligibleAutoOptimizerDualOutputActiveStreamSetup(filtered));
});

test('Dual Output remains estimate-only when a canvas has no supported representative', t => {
  const streamSetup = twitchKickYoutubeDualOutputStreamSetup();
  streamSetup.outputs[1].destinations = [{ platform: 'kick' }];
  streamSetup.outputs[1].probeCandidates = [];

  const filtered = prepareAutoOptimizerStreamSetup(streamSetup);
  t.true(filtered.outputs.every(output => output.measurement === 'estimated'));
  t.deepEqual(allProbeCandidates(filtered), []);
});

test('active Dual Output requires a unique probe ID for each output', t => {
  const reusedProbeId = twitchYoutubeDualOutputStreamSetup();
  reusedProbeId.outputs[1].probeCandidates[0].probeId =
    reusedProbeId.outputs[0].probeCandidates[0].probeId;
  t.false(isEligibleAutoOptimizerDualOutputActiveStreamSetup(reusedProbeId));
});

test('a single multi-destination output nested under Dual Output is estimate-only', t => {
  const streamSetup = sharedCloudStreamSetup();
  streamSetup.type = 'dual-output';

  const filtered = prepareAutoOptimizerStreamSetup(streamSetup);

  t.is(filtered.outputs[0].measurement, 'estimated');
  t.is(filtered.outputs[0].estimateReason, 'dual_output');
  t.deepEqual(allProbeCandidates(filtered), []);
});

test('YouTube display both cannot create two active probe leases', t => {
  const outputs = ['horizontal', 'vertical'].map(display => ({
    outputId: display,
    display: display as 'horizontal' | 'vertical',
    outputKind: 'standard' as const,
    destinations: [{ platform: 'youtube' as const }],
    probeCandidates: [
      {
        probeId: `${display}-youtube`,
        kind: 'youtube-unbound' as const,
        outputId: display,
        platform: 'youtube' as const,
      },
    ],
    measurement: 'active' as const,
  }));
  const streamSetup: IAutoOptimizerStreamSetup = {
    type: 'dual-output',
    outputs,
  };

  const filtered = prepareAutoOptimizerStreamSetup(streamSetup);

  t.true(filtered.outputs.every(output => output.measurement === 'estimated'));
  t.deepEqual(allProbeCandidates(filtered), []);
});

test('active evidence matches selected platforms and partial coverage requires low confidence', t => {
  const partial = {
    destinations: [{ platform: 'twitch' as const }, { platform: 'youtube' as const }],
    attemptedCandidates: [{ platform: 'twitch' as const, kind: 'twitch-standard' as const }],
    evidence: [
      {
        platform: 'twitch' as const,
        method: 'twitch-bandwidth-test' as const,
        success: true,
      },
    ],
  };

  t.true(isValidAutoOptimizerActiveProbeCoverage({ ...partial, confidence: 'low' }));
  t.false(isValidAutoOptimizerActiveProbeCoverage({ ...partial, confidence: 'medium' }));
  t.false(
    isValidAutoOptimizerActiveProbeCoverage({
      ...partial,
      confidence: 'low',
      evidence: [
        {
          platform: 'twitch',
          method: 'twitch-enhanced-broadcasting-test',
          success: true,
        },
      ],
    }),
  );
  t.false(
    isValidAutoOptimizerActiveProbeCoverage({
      ...partial,
      confidence: 'low',
      evidence: [
        ...partial.evidence,
        { platform: 'youtube', method: 'youtube-unbound-ramp', success: true },
      ],
    }),
  );
  t.false(
    isValidAutoOptimizerActiveProbeCoverage({
      ...partial,
      confidence: 'low',
      evidence: [{ ...partial.evidence[0], success: false }],
    }),
  );
});

test('sequential platform bandwidth events receive distinct pacing keys', t => {
  t.is(autoOptimizerPhaseStepKey('bandwidth', 'twitch'), 'bandwidth:twitch:measuring:0');
  t.is(autoOptimizerPhaseStepKey('bandwidth', 'youtube'), 'bandwidth:youtube:measuring:0');
  t.not(
    autoOptimizerPhaseStepKey('bandwidth', 'twitch'),
    autoOptimizerPhaseStepKey('bandwidth', 'youtube'),
  );
  t.is(
    autoOptimizerPhaseStepKey('bandwidth', 'twitch', 'enhanced_broadcasting_testing_candidate', {
      width: 1920,
      height: 1080,
      fpsNum: 60,
      fpsDen: 1,
    }),
    'bandwidth:twitch:enhanced_broadcasting_testing_candidate:1920x1080:60/1',
  );
  t.not(
    autoOptimizerPhaseStepKey('bandwidth', 'twitch', 'enhanced_broadcasting_testing_candidate', {
      width: 1920,
      height: 1080,
      fpsNum: 60,
      fpsDen: 1,
    }),
    autoOptimizerPhaseStepKey('bandwidth', 'twitch', 'enhanced_broadcasting_candidate_rejected', {
      width: 1920,
      height: 1080,
      fpsNum: 60,
      fpsDen: 1,
    }),
  );
  t.is(
    autoOptimizerPhaseStepKey(
      'bandwidth',
      'twitch',
      'enhanced_broadcasting_validating_target_cadence',
      { width: 1920, height: 1080, fpsNum: 60, fpsDen: 1 },
    ),
    'bandwidth:twitch:enhanced_broadcasting_validating_target_cadence:1920x1080:60/1',
  );
  t.not(
    autoOptimizerPhaseStepKey('bandwidth', 'twitch', 'enhanced_broadcasting_testing_candidate', {
      width: 1920,
      height: 1080,
      fpsNum: 60,
      fpsDen: 1,
      additionalVideo: {
        display: 'vertical',
        width: 1080,
        height: 1920,
        fpsNum: 60,
        fpsDen: 1,
      },
    }),
    autoOptimizerPhaseStepKey('bandwidth', 'twitch', 'enhanced_broadcasting_testing_candidate', {
      width: 1920,
      height: 1080,
      fpsNum: 60,
      fpsDen: 1,
      additionalVideo: {
        display: 'vertical',
        width: 720,
        height: 1280,
        fpsNum: 60,
        fpsDen: 1,
      },
    }),
  );
  t.is(autoOptimizerPhaseStepKey('hardware', 'youtube'), 'hardware');
  t.is(
    autoOptimizerPhaseStepKey('hardware', null, 'hardware_discovering_encoders'),
    'hardware:discovering',
  );
  t.is(
    autoOptimizerPhaseStepKey('hardware', null, 'hardware_validating_encoder'),
    'hardware:validating:encoder:0x0:0/0',
  );
  t.not(
    autoOptimizerPhaseStepKey('hardware', null, 'hardware_testing_encoder'),
    autoOptimizerPhaseStepKey('hardware', null, 'hardware_validating_encoder'),
  );
  t.is(
    autoOptimizerPhaseStepKey('hardware', null, 'hardware_encoder_selected'),
    'hardware:selected:encoder:0x0:0/0',
  );
  const surfaceAttempt = {
    encoderId: 'obs_nvenc_h264_tex',
    width: 1920,
    height: 1080,
    fpsNum: 30,
    fpsDen: 1,
  };
  t.is(
    autoOptimizerPhaseStepKey(
      'hardware',
      null,
      'hardware_testing_encoder_surfaces',
      surfaceAttempt,
    ),
    'hardware:surfaces:obs_nvenc_h264_tex:1920x1080',
  );
  t.is(
    autoOptimizerPhaseStepKey('hardware', null, 'hardware_validating_target_cadence', {
      ...surfaceAttempt,
      fpsNum: 60,
    }),
    'hardware:target-cadence:obs_nvenc_h264_tex:1920x1080:60/1',
  );
  t.not(
    autoOptimizerPhaseStepKey(
      'hardware',
      null,
      'hardware_testing_encoder_surfaces',
      surfaceAttempt,
    ),
    autoOptimizerPhaseStepKey('hardware', null, 'hardware_testing_encoder_surfaces', {
      ...surfaceAttempt,
      width: 1280,
      height: 720,
    }),
  );
  t.is(
    autoOptimizerPhaseStepKey('recommendation', null, 'recommendation_selecting_quality'),
    'recommendation:selecting:0',
  );
  t.is(
    autoOptimizerPhaseStepKey('recommendation', null, 'recommendation_quality_selected'),
    'recommendation',
  );
  t.not(
    autoOptimizerPhaseStepKey('recommendation', null, 'recommendation_selecting_quality'),
    autoOptimizerPhaseStepKey('recommendation', null, 'recommendation_quality_selected'),
  );
  t.is(
    autoOptimizerPhaseStepKey('hardware', null, 'hardware_provider_managed'),
    autoOptimizerPhaseStepKey('recommendation', null, 'recommendation_provider_managed'),
  );
  t.is(autoOptimizerPhaseStepKey('cleanup', null, 'cleanup_resources'), 'cleanup');
  t.is(
    autoOptimizerPhaseStepKey('hardware', null, 'hardware_encoder_rejected'),
    'hardware:rejected:encoder',
  );
  t.is(
    autoOptimizerPhaseStepKey('bandwidth', 'youtube', 'youtube_probe_completed'),
    'bandwidth:youtube:youtube_probe_completed:0',
  );
  t.is(
    autoOptimizerPhaseStepKey('bandwidth', 'twitch', 'twitch_probe_failed_estimate_used'),
    'bandwidth:twitch:twitch_probe_failed_estimate_used:0',
  );
  t.is(
    autoOptimizerPhaseStepKey('bandwidth', 'youtube', 'youtube_probe_source_underfill_completed'),
    'bandwidth:youtube:youtube_probe_source_underfill_completed:0',
  );
  t.not(
    autoOptimizerPhaseStepKey('bandwidth', 'youtube', 'youtube_probe_completed'),
    autoOptimizerPhaseStepKey('bandwidth', 'youtube', 'youtube_probe_baseline'),
  );

  t.not(
    autoOptimizerPhaseStepKey('bandwidth', 'youtube', 'youtube_probe_baseline', {
      targetBitrateKbps: 4500,
    }),
    autoOptimizerPhaseStepKey('bandwidth', 'youtube', 'youtube_probe_baseline', {
      targetBitrateKbps: 6000,
    }),
  );
  t.is(
    autoOptimizerPhaseStepKey('bandwidth', 'youtube', 'youtube_probe_measuring', {
      targetBitrateKbps: 4500,
    }),
    autoOptimizerPhaseStepKey('bandwidth', 'youtube', 'unknown_native_code', {
      targetBitrateKbps: 4500,
    }),
  );
  t.not(
    autoOptimizerPhaseStepKey('hardware', null, 'hardware_testing_encoder', {
      encoderTitle: 'NVIDIA NVENC H.264',
      width: 1920,
      height: 1080,
      fpsNum: 60,
      fpsDen: 1,
    }),
    autoOptimizerPhaseStepKey('hardware', null, 'hardware_testing_encoder', {
      encoderTitle: 'Intel QSV H.264',
      width: 1920,
      height: 1080,
      fpsNum: 60,
      fpsDen: 1,
    }),
  );
  t.not(
    autoOptimizerPhaseStepKey('recommendation', null, 'recommendation_selecting_quality', {
      availableBitrateKbps: 4500,
    }),
    autoOptimizerPhaseStepKey('recommendation', null, 'recommendation_selecting_quality', {
      availableBitrateKbps: 6000,
    }),
  );
});

test('Dual Output progress follows OSN hardware and recommendation phases', t => {
  t.is(
    autoOptimizerPhaseStepKey('hardware', null, 'dual_output_testing_workload', {
      encoderTitle: 'NVIDIA NVENC H.264',
      width: 1920,
      height: 1080,
      fpsNum: 60,
      fpsDen: 1,
    }),
    'hardware:dual-output:workload:NVIDIA NVENC H.264:1920x1080:60/1',
  );
  t.is(
    autoOptimizerPhaseStepKey('recommendation', null, 'dual_output_allocating_upload', {
      selectedBitrateKbps: 5000,
      availableBitrateKbps: 10000,
    }),
    'recommendation:dual-output:allocating:5000:10000',
  );

  const workload = sanitizeAutoOptimizerProgressDetail(
    {
      type: 'progress',
      phase: 'hardware',
      progress: 20,
      code: 'dual_output_testing_workload',
      width: 1920,
      height: 1080,
      fpsNum: 60,
      fpsDen: 1,
      targetBitrateKbps: 10000,
    },
    'hardware',
  );
  t.is(workload.platform, null);
  t.is(workload.targetBitrateKbps, null, 'hardware work does not claim a probe bitrate');
  t.is(workload.width, 1920);

  const allocation = sanitizeAutoOptimizerProgressDetail(
    {
      type: 'progress',
      phase: 'recommendation',
      progress: 75,
      code: 'dual_output_allocating_upload',
      selectedBitrateKbps: 5000,
      availableBitrateKbps: 10000,
    },
    'recommendation',
  );
  t.is(allocation.selectedBitrateKbps, 5000);
  t.is(allocation.availableBitrateKbps, 10000);
});

test('progress pacing coalesces repeats but preserves A to B to A transitions', t => {
  t.is(autoOptimizerPhaseStepDisposition('A', [], 'A'), 'update-displayed');
  t.is(autoOptimizerPhaseStepDisposition('A', ['B'], 'B'), 'update-pending-tail');
  t.is(autoOptimizerPhaseStepDisposition('A', ['B'], 'A'), 'enqueue');
  t.is(autoOptimizerPhaseStepDisposition('A', ['B', 'A'], 'B'), 'enqueue');
});

test('progress sanitization preserves only bounded OSN status fields', t => {
  const event: IAutoOptimizerEvent = {
    type: 'progress',
    phase: 'hardware',
    progress: 25,
    code: 'hardware_testing_encoder',
    encoderId: 'obs_nvenc_h264_tex',
    encoderFamily: 'obs_nvenc_h264_tex',
    encoderTitle: 'NVIDIA NVENC H.264',
    width: 1920,
    height: 1080,
    fpsNum: 60000,
    fpsDen: 1001,
    additionalVideo: {
      display: 'vertical',
      width: 1080,
      height: 1920,
      fpsNum: 60000,
      fpsDen: 1001,
    },
    targetBitrateKbps: 6000,
    availableBitrateKbps: 9000,
  };

  t.deepEqual(sanitizeAutoOptimizerProgressDetail(event, 'hardware'), {
    code: 'hardware_testing_encoder',
    platform: null,
    targetBitrateKbps: null,
    availableBitrateKbps: 9000,
    encoderId: 'obs_nvenc_h264_tex',
    encoderFamily: 'obs_nvenc_h264_tex',
    encoderTitle: 'NVIDIA NVENC H.264',
    width: 1920,
    height: 1080,
    fpsNum: 60000,
    fpsDen: 1001,
    additionalVideo: {
      display: 'vertical',
      width: 1080,
      height: 1920,
      fpsNum: 60000,
      fpsDen: 1001,
    },
    selectedBitrateKbps: null,
  });
});

test('renderer-bound progress and evidence discard malformed or private fields', t => {
  const malformedEvent = ({
    type: 'progress',
    phase: 'bandwidth',
    progress: 40,
    code: '<script>',
    probe: { id: 'youtube', kind: 'youtube-unbound' },
    targetBitrateKbps: 10000,
    availableBitrateKbps: Number.POSITIVE_INFINITY,
    encoderId: 'x'.repeat(300),
    width: -1,
    additionalVideo: { display: 'horizontal', width: 1080, height: 1920 },
  } as unknown) as IAutoOptimizerEvent;
  const detail = sanitizeAutoOptimizerProgressDetail(malformedEvent, 'bandwidth');
  t.is(detail.platform, 'youtube');
  t.is(detail.targetBitrateKbps, 10000);
  t.is(detail.code, null);
  t.is(detail.availableBitrateKbps, null);
  t.is(detail.encoderId, null);
  t.is(detail.width, null);
  t.is(detail.additionalVideo, null);

  t.deepEqual(
    sanitizeAutoOptimizerProbeEvidence([
      {
        platform: 'twitch',
        method: 'twitch-bandwidth-test',
        success: true,
        streamKey: 'must-not-leak',
      },
      { platform: 'youtube', method: 'twitch-bandwidth-test', success: true },
      { platform: 'youtube', method: 'youtube-unbound-ramp', success: 'yes' },
    ]),
    [{ platform: 'twitch', method: 'twitch-bandwidth-test', success: true }],
  );
});
