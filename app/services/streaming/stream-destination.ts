import { URL } from 'url';

interface IStreamDestination {
  streamType: string;
  service?: string;
  server?: string;
}

/** Common Twitch services provide the configuration URL required by Enhanced Broadcasting. */
export function isCommonTwitchService(destination: IStreamDestination): boolean {
  return destination.streamType === 'rtmp_common' && destination.service === 'Twitch';
}

/** Identify the destination independently of the account used to sign into Desktop. */
export function isTwitchStreamDestination(destination: IStreamDestination): boolean {
  if (destination.streamType === 'rtmp_common') return isCommonTwitchService(destination);
  if (destination.streamType !== 'rtmp_custom' || !destination.server) return false;

  try {
    // Electron's browser URL parser treats RTMP URLs as opaque and has no hostname.
    const { protocol, hostname } = new URL(destination.server);
    if (protocol !== 'rtmp:' && protocol !== 'rtmps:') return false;

    const host = hostname.toLowerCase();
    return (
      host.endsWith('.twitch.tv') ||
      host.endsWith('.contribute.live-video.net') ||
      host === 'ingest.global-contribute.live-video.net'
    );
  } catch (e: unknown) {
    return false;
  }
}
