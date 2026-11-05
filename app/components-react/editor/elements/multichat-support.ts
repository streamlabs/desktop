import { getPlatformService, TPlatform } from 'services/platforms';

/**
 * Multichat is only available when logged in (the platform is only set then) to a platform that
 * supports it. It is checked here so the layout element can render an explanation wherever it is
 * placed, and so containers (e.g. the dock) can decide whether they have anything worth showing.
 */
export function isMultichatSupported(platform?: { type: TPlatform } | null): boolean {
  return !!platform && getPlatformService(platform.type).multichatEnabled;
}
