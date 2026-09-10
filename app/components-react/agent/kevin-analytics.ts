import { Services } from 'components-react/service-provider';

/**
 * Every support-chat analytics action.
 *
 * Exported because `KevinSupportService` fires five of these from the worker and
 * imports this type to stay checked against the same list -- a type-only import,
 * so no runtime dependency runs the wrong way. The Automations version skipped
 * that step and its service-side 'automation_fired' is absent from the union.
 */
export type TSupportChatAction =
  | 'chat_opened'
  | 'message_sent'
  | 'run_ended'
  | 'tool_executed'
  | 'approval_requested'
  | 'approval_resolved'
  | 'limit_reached'
  | 'upsell_clicked';

/** Where an approval was answered. The footer bubble exists so the chat window need not be. */
export type TApprovalSurface = 'chat' | 'footer';
/** Which upgrade affordance was clicked. */
export type TUpsellSource = 'meter' | 'modal';
/** How the spent quota was announced -- Ultra+ gets a toast, everyone else the modal. */
export type TLimitSurface = 'modal' | 'toast';

export const KevinAnalytics = {
  track(action: TSupportChatAction, payload?: Record<string, unknown>) {
    Services.UsageStatisticsService.actions.recordAnalyticsEvent('SupportChat', {
      action,
      ...payload,
    });
  },
  /** The footer icon was clicked, whether or not that created a new window. */
  chatOpened: () => KevinAnalytics.track('chat_opened'),
  /** The user hit the cap and was told so. */
  limitReached: (payload: { tier: string; max: number; surface: TLimitSurface }) =>
    KevinAnalytics.track('limit_reached', payload),
  upsellClicked: (payload: { tier: string; target: string; source: TUpsellSource }) =>
    KevinAnalytics.track('upsell_clicked', payload),
};
