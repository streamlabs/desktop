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
      measuredKbps: 9000,
      safeKbps: 6000,
      headroomPercent: 30,
      success: true,
    },
  ],
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

test('active recommendations cannot exceed the lowest successful safe result', t => {
  t.is(
    validateAutoConfigRecommendation(recommendation({ bitrateKbps: 6001 }), activeContext),
    null,
  );
  t.truthy(
    validateAutoConfigRecommendation(recommendation({ bitrateKbps: 6000 }), activeContext),
  );
});

test('malformed geometry rejects the entire recommendation', t => {
  t.is(validateAutoConfigRecommendation(recommendation({ width: 1919 }), activeContext), null);
  t.is(validateAutoConfigRecommendation(recommendation({ fpsDen: 0 }), activeContext), null);
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
