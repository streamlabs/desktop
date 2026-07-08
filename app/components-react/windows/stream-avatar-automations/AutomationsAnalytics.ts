import { Services } from 'components-react/service-provider';

type TAutomationsAction =
  | 'page_view'
  | 'template_added'
  | 'automation_created'
  | 'automation_updated'
  | 'automation_fired';

export const AutomationsAnalytics = {
  track(action: TAutomationsAction, payload?: Record<string, unknown>) {
    Services.UsageStatisticsService.recordAnalyticsEvent('Automations', { action, ...payload });
  },
  pageView: () => AutomationsAnalytics.track('page_view'),
  templateAdded: (game: string, trigger: string, actions: string[]) =>
    AutomationsAnalytics.track('template_added', { game, trigger, actions }),
  automationCreated: (game: string, trigger: string, actions: string[]) =>
    AutomationsAnalytics.track('automation_created', { game, trigger, actions }),
  automationUpdated: (game: string, trigger: string, actions: string[]) =>
    AutomationsAnalytics.track('automation_updated', { game, trigger, actions }),
};
