import { getPlatformService, TPlatform } from 'services/platforms';

/**
 * Multichat is only available for platforms that support it. It is checked here so the layout
 * element can render an explanation wherever it is placed, and so containers (e.g. the dock)
 * can decide whether they have anything worth showing.
 */
export function isMultichatSupported(platform?: { type: TPlatform } | null): boolean {
  return !!platform && getPlatformService(platform.type).multichatEnabled;
}
