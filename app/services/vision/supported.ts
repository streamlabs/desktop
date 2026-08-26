import Utils from 'services/utils';
import { getOS, OS } from 'util/operating-systems';

/**
 * Vision only ships on Windows; Mac is allowed in dev builds so the feature can
 * be worked on there. Automations shares this gate — every automation condition
 * is driven by a vision event, so without Vision they can be created but can
 * never fire.
 *
 * Deliberately a leaf module: `services/vision/index.ts` imports `app-services`,
 * so importing the predicate from there would cycle back through
 * `AutomationsService`.
 */
export function isVisionSupported(): boolean {
  return getOS() === OS.Windows || (getOS() === OS.Mac && Utils.isDevMode());
}
