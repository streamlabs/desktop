import { Services } from 'components-react/service-provider';

type TAutomationsAction =
  | 'page_view'
  | 'template_added'
  | 'automation_created'
  | 'automation_updated'
  | 'limit_reached'
  | 'upsell_clicked';

/** Which code path ran into the enabled-automations cap. */
export type TLimitTrigger = 'toggle' | 'editor' | 'templates';
/** Which surface the user clicked through from. */
export type TUpsellSource = 'modal' | 'header';

export const AutomationsAnalytics = {
  track(action: TAutomationsAction, payload?: Record<string, unknown>) {
    Services.UsageStatisticsService.actions.recordAnalyticsEvent('Automations', {
      action,
      ...payload,
    });
  },
  pageView: () => AutomationsAnalytics.track('page_view'),
  templateAdded: (game: string, trigger: string, actions: string[]) =>
    AutomationsAnalytics.track('template_added', { game, trigger, actions }),
  automationCreated: (game: string, trigger: string, actions: string[]) =>
    AutomationsAnalytics.track('automation_created', { game, trigger, actions }),
  automationUpdated: (game: string, trigger: string, actions: string[]) =>
    AutomationsAnalytics.track('automation_updated', { game, trigger, actions }),
  /** The user hit the cap and was shown the upsell modal (or the Ultra+ hard-cap toast). */
  limitReached: (payload: {
    tier: string;
    max: number;
    requested: number;
    trigger: TLimitTrigger;
    surface: 'modal' | 'toast';
  }) => AutomationsAnalytics.track('limit_reached', payload),
  upsellClicked: (payload: { tier: string; target: string; source: TUpsellSource }) =>
    AutomationsAnalytics.track('upsell_clicked', payload),
};
