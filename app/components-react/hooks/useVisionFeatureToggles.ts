import { useRealmObject } from 'components-react/hooks/realm';
import { useAgentAppInstalled } from 'components-react/hooks/useAgentAppInstalled';
import { Services } from 'components-react/service-provider';

export type VisionFeature = 'automations' | 'reactiveOverlays' | 'gamePulse' | 'sidekick';
export type VisionFeatureToggles = Record<VisionFeature, boolean>;

/**
 * Reads the "is on" state of each Vision feature toggle and provides the
 * "turn on / turn off" handler, which also starts or stops Vision itself.
 */
export function useVisionFeatureToggles(
  onToggle?: (feature: VisionFeature, checked: boolean) => void,
) {
  const { AutomationsService, VisionService } = Services;
  const {
    isInstalled: isSidekickInstalled,
    isEnabled: isSidekickAppEnabled,
    ...sidekick
  } = useAgentAppInstalled();
  const automationsSettings = useRealmObject(AutomationsService.settings);
  const visionEnabledState = useRealmObject(VisionService.enabledState);

  const toggles: VisionFeatureToggles = {
    automations: automationsSettings.isEnabled,
    reactiveOverlays: !visionEnabledState.skipEnableForReactiveOverlays,
    gamePulse: !visionEnabledState.skipEnableForGamePulse,
    sidekick: isSidekickInstalled && isSidekickAppEnabled,
  };
  const allFeaturesOff = Object.values(toggles).every(on => !on);

  function setFeature(feature: VisionFeature, checked: boolean) {
    onToggle?.(feature, checked);

    switch (feature) {
      case 'automations':
        AutomationsService.actions.setIsEnabled(checked);
        break;
      case 'reactiveOverlays':
        VisionService.actions.setFeatureSettings({ skipEnableForReactiveOverlays: !checked });
        break;
      case 'gamePulse':
        VisionService.actions.setFeatureSettings({ skipEnableForGamePulse: !checked });
        break;
      case 'sidekick':
        if (!checked) sidekick.disableAgent();
        else if (isSidekickInstalled) sidekick.enableAgent();
        else void sidekick.installAgent();
        break;
    }

    if (checked) {
      // Starts Vision, installing it first if needed.
      if (!visionEnabledState.isEnabled) VisionService.actions.setIsEnabled(true);
    } else if (Object.values({ ...toggles, [feature]: false }).every(on => !on)) {
      VisionService.actions.setIsEnabled(false);
    }
  }

  return { toggles, allFeaturesOff, setFeature };
}
