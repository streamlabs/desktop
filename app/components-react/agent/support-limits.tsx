import React from 'react';
import { message } from 'antd';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import UltraIcon from 'components-react/shared/UltraIcon';
import { promptAction } from 'components-react/modals';

/**
 * Support-chat interaction allowances, mirroring the server's RateLimitService.
 *
 * Kept here only so the tooltip and the upsell can name the next tier's number.
 * The server is the authority and its counts arrive on `v2:rateLimit` -- nothing
 * here gates a request, and a drift between these numbers and the server's is a
 * wrong sentence, never a wrong decision.
 *
 * Note the free tier is a LIFETIME allowance, not monthly: it does not come back
 * next month, which is the whole reason the upsell is worth showing.
 */
export const INTERACTION_LIMITS: Record<string, number> = {
  free: 100,
  ultra: 1000,
  ultra_plus: 5000,
};

/** Matches automations-limits: only 'free' and 'ultra' come back from the API today. */
export const ULTRA_PLUS_TIER = 'ultra_plus';

/**
 * The tier this user is on.
 *
 * `views.tier` already resolves the whole ladder -- 'free' when logged out,
 * the server's tier when it has one, otherwise 'ultra' for a Prime account --
 * so reading it directly is both correct and the same thing enabledUsage() does
 * for Automations. An earlier isPrime wrapper here returned 'free' for anyone
 * whose tier was set but whose isPrime flag was not.
 */
export function supportTier(): string {
  return Services.UserService.views.tier;
}

/** Sends the user to checkout for whatever tier sits above the one they are on. */
export function upgrade(currentTier: string) {
  const toUltraPlus = currentTier === 'ultra';

  // A distinct refl from Automations' 'slobs-automations', so the two upsells
  // are separable in the Ultra conversion funnel rather than one blended number.
  Services.MagicLinkService.actions.linkToPrime('slobs-support-chat', {
    event: 'SupportChat',
    ...(toUltraPlus ? { tier: ULTRA_PLUS_TIER } : {}),
  });
}

/**
 * The "you are out of interactions" upsell.
 *
 * Called when the server says the limit is spent. Deliberately not a gate: the
 * server already refused the request and said so, and a second client-side
 * refusal would be a guess layered on an answer we already have.
 */
export function promptUpgrade(tier: string) {
  const max = INTERACTION_LIMITS[tier] ?? INTERACTION_LIMITS.free;

  if (tier === ULTRA_PLUS_TIER) {
    message.warning($t("You've used all %{max} of this month's support interactions.", { max }), 5);
    return;
  }

  // Pairs with the recordUltra that linkToPrime fires, so shown-vs-clicked is a
  // straight ratio within one stream.
  Services.UsageStatisticsService.actions.recordShown('SupportChat', 'slobs-support-chat');

  const toUltraPlus = tier === 'ultra';
  promptAction({
    title: $t('Interaction limit reached'),
    message: toUltraPlus
      ? $t('Ultra includes %{max} support interactions a month. Upgrade to Ultra+ for %{next}.', {
          max,
          next: INTERACTION_LIMITS[ULTRA_PLUS_TIER],
        })
      : $t(
          'Free accounts include %{max} support interactions in total. Upgrade to Ultra for %{next} every month.',
          { max, next: INTERACTION_LIMITS.ultra },
        ),
    icon: <UltraIcon type="badge" />,
    btnText: toUltraPlus ? $t('Upgrade to Ultra+') : $t('Upgrade to Ultra'),
    fn: () => upgrade(tier),
    cancelBtnPosition: 'left',
    cancelBtnText: $t('Not now'),
  });
}
