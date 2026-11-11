import type { TPlatform } from 'services/platforms';

/**
 * Video codecs a platform's ingest accepts, for platforms OBS cannot validate itself.
 *
 * Platforms configured as `rtmp_common` (Twitch, YouTube, Facebook) declare their codecs in
 * obs-studio's rtmp-services `services.json`, and OSN rejects an incompatible encoder when the
 * output starts, which surfaces as `INVALID_ENCODER`. Platforms configured as `rtmp_custom`
 * declare nothing, so OSN accepts any codec the RTMP output supports (H.264, HEVC, AV1). An
 * ingest that only takes H.264 then drops the connection right after it connects, leaving the
 * output in a silent reconnect loop.
 *
 * Platforms missing from this table are treated as unconstrained. Only add a platform with
 * direct evidence of what its live ingest accepts: a wrong entry blocks a working encoder.
 * TikTok, Patreon and Instagram accept H.264 and HEVC and are intentionally left out.
 */
export const PLATFORM_SUPPORTED_VIDEO_CODECS: Partial<Record<TPlatform, readonly string[]>> = {
  // "KICK currently only supports X264 / H.264 encoding."
  // https://help.kick.com/en/articles/7066931-how-to-stream-on-kick-com
  kick: ['h264'],
  // X only accepts H.264. obs-studio's rtmp-services `services.json` also declares the
  // "Twitter" service as h264-only, but Desktop streams to X as rtmp_custom, so OSN never
  // applies that list.
  twitter: ['h264'],
};

const VIDEO_CODEC_LABELS: Record<string, string> = {
  h264: 'H.264',
  hevc: 'HEVC',
  av1: 'AV1',
};

export interface IPlatformCodecIncompatibility {
  platform: TPlatform;
  /** Codec of the selected streaming encoder, as reported by OBS (e.g. `hevc`). */
  codec: string;
  supportedCodecs: readonly string[];
}

/**
 * An unknown codec or an unconstrained platform counts as supported, so a metadata gap
 * never blocks Go Live.
 */
export function isVideoCodecSupportedByPlatform(
  platform: TPlatform,
  codec: string | undefined,
): boolean {
  const supportedCodecs = PLATFORM_SUPPORTED_VIDEO_CODECS[platform];
  if (!supportedCodecs || !codec) return true;
  return supportedCodecs.includes(codec);
}

/** The first platform that does not accept `codec`, or null if all of them do. */
export function findPlatformCodecIncompatibility(
  platforms: TPlatform[],
  codec: string | undefined,
): IPlatformCodecIncompatibility | null {
  const platform = platforms.find(p => !isVideoCodecSupportedByPlatform(p, codec));
  if (!platform || !codec) return null;

  return {
    platform,
    codec,
    supportedCodecs: PLATFORM_SUPPORTED_VIDEO_CODECS[platform] ?? [],
  };
}

export function videoCodecLabel(codec: string): string {
  return VIDEO_CODEC_LABELS[codec] ?? codec.toUpperCase();
}
