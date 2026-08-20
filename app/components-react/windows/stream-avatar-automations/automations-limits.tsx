import React from 'react';
import { message } from 'antd';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import UltraIcon from 'components-react/shared/UltraIcon';
import { promptAction } from 'components-react/modals';
import type { TAutomationExport } from 'services/stream-avatar/engine/automations';
import { AutomationsAnalytics } from './automations-analytics';
import type { TLimitTrigger, TUpsellSource } from './automations-analytics';

/**
 * How many automations may be enabled at once, by subscription tier.
 */
export const AUTOMATION_LIMITS: Record<string, number> = {
  free: 5,
  ultra: 10,
  ultra_plus: 30,
};

/** TODO: confirm with backend — only 'free' and 'ultra' are returned today. */
export const ULTRA_PLUS_TIER = 'ultra_plus';

const FREE_LIMIT = AUTOMATION_LIMITS.free;

export function limitForTier(tier: string): number {
  return AUTOMATION_LIMITS[tier] ?? FREE_LIMIT;
}

export function enabledCount(automations: TAutomationExport[]): number {
  return automations.filter(a => a.enabled).length;
}

/** Current enabled count and the cap for this user's tier. */
export function enabledUsage(): { count: number; max: number; tier: string } {
  const { AutomationsService, UserService } = Services;
  const tier = UserService.views.tier;
  return {
    count: enabledCount(AutomationsService.state.automations),
    max: limitForTier(tier),
    tier,
  };
}

/** Sends the user to checkout for whatever tier sits above the one they're on. */
export function upgrade(currentTier: string, source: TUpsellSource) {
  const toUltraPlus = currentTier === 'ultra';
  const target = toUltraPlus ? ULTRA_PLUS_TIER : 'ultra';

  AutomationsAnalytics.upsellClicked({ tier: currentTier, target, source });
  // linkToPrime also fires the global recordClick('Automations', 'slobs-automations')
  // that the Ultra conversion funnel attributes against.
  Services.MagicLinkService.actions.linkToPrime('slobs-automations', {
    event: 'Automations',
    ...(toUltraPlus ? { tier: ULTRA_PLUS_TIER } : {}),
  });
}

/**
 * Whether `count` more automations can be enabled. Returns false *and has already
 * shown the upgrade modal (or the hard-cap toast)* when they cannot.
 */
export function checkEnableLimit(count = 1, trigger: TLimitTrigger = 'toggle'): boolean {
  const { count: current, max, tier } = enabledUsage();
  if (current + count <= max) return true;

  const atHardCap = tier === ULTRA_PLUS_TIER;
  AutomationsAnalytics.limitReached({
    tier,
    max,
    requested: count,
    trigger,
    surface: atHardCap ? 'toast' : 'modal',
  });

  if (atHardCap) {
    message.warning(
      $t(
        "You've reached the maximum of %{max} enabled automations. Disable one to enable another.",
        { max },
      ),
      5,
    );
    return false;
  }

  // Pairs with the recordClick('Automations', 'slobs-automations') that linkToPrime
  // fires, so shown-vs-clicked is a straight ratio in the same stream.
  Services.UsageStatisticsService.actions.recordShown('Automations', 'slobs-automations');

  const toUltraPlus = tier === 'ultra';
  promptAction({
    title: $t('Automation limit reached'),
    message: toUltraPlus
      ? $t(
          'Ultra includes %{max} enabled automations. Upgrade to Ultra+ to enable up to %{next}.',
          { max, next: AUTOMATION_LIMITS[ULTRA_PLUS_TIER] },
        )
      : $t(
          'You can enable %{max} automations on a free account. Upgrade to Ultra to enable up to %{next}.',
          { max, next: AUTOMATION_LIMITS.ultra },
        ),
    icon: <UltraIcon type="badge" />,
    btnText: toUltraPlus ? $t('Upgrade to Ultra+') : $t('Upgrade to Ultra'),
    fn: () => upgrade(tier, 'modal'),
    cancelBtnPosition: 'left',
    cancelBtnText: $t('Not now'),
  });
  return false;
}
