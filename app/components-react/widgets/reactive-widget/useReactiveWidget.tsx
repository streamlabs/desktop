import { IWidgetCommonState, useWidget, WidgetModule } from '../common/useWidget';
import { injectFormBinding } from 'slap';
import cloneDeep from 'lodash/cloneDeep';

interface IReactiveWidgetState extends IWidgetCommonState {
  data: { settings: {} }; // TODO$chris: define settings structure
}

type ReactiveTriggerType = 'streak' | 'achievement';
type ReactiveLayout = 'above' | 'banner' | 'side';
type ReactiveStreakPeriod = 'session' | 'today' | 'round';

interface ReactiveMediaSettings {
  image_href: string;
  sound_href: string;
  sound_volume: number;
  show_animation: string;
  hide_animation: string;
}

interface ReactiveTextSettings {
  message_template: string;
  font: string;
  font_size: number;
  font_color: string;
  font_color2: string;
  text_delay_ms: number;
  text_animation: string;
}

interface ReactiveTtsSettings {
  enabled: boolean;
  language: string;
  security: number;
  repetition_block_length: number;
  volume: number;
  include_message_template: boolean;
}

interface ReactiveBaseTrigger {
  id: string;
  enabled: boolean;
  name: string;
  game_event: string;
  layout: ReactiveLayout;
  alert_duration_ms: number;
  media_settings: ReactiveMediaSettings;
  text_settings: ReactiveTextSettings;
  tts_settings: ReactiveTtsSettings;
}

interface ReactiveStreakTrigger extends ReactiveBaseTrigger {
  type: 'streak';
  streak_period: ReactiveStreakPeriod;
  amount_minimum: number;
  amount_maximum?: number;
}

interface ReactiveAchievementTrigger extends ReactiveBaseTrigger {
  type: 'achievement';
  streak_period?: undefined;
  amount_minimum?: undefined;
  amount_maximum?: undefined;
}

export type IReactiveWidgetTrigger =
  | ReactiveStreakTrigger
  | ReactiveAchievementTrigger;

export class ReactiveWidgetModule extends WidgetModule<IReactiveWidgetState> {
  protected patchBeforeSend(settings: any) {
    return settings;
  }

  /**
   * normalizes the API response so WidgetModule sees `{ settings: ... }`.
   * raw is something like: { success, message, data: { ..., settings }, settings? }
   */
  protected patchAfterFetch(raw: any) {
    const settings = raw.settings ?? raw.data?.settings ?? {};
    return { settings };
  }

  private findTrigger(groupId: string, triggerId: string) {
    const s = this.settings as any;
    if (!s) return null;

    const group =
      groupId === 'global'
        ? s.global
        : s.games?.[groupId];

    if (!group) return null;

    return (group.triggers || []).find((t: any) => t.id === triggerId) || null;
  }

  createTriggerBinding(
    groupId: string,
    triggerId: string,
    forceUpdate: () => unknown,
  ) {
    const module = this;

    return {
      get trigger(): IReactiveWidgetTrigger | null {
        return module.findTrigger(groupId, triggerId) as IReactiveWidgetTrigger | null;
      },

      updateTrigger(updated: IReactiveWidgetTrigger) {
        const s = cloneDeep(module.settings) as any;
        const defaultGroup = { enabled: true, triggers: [] }; 
        const group =
          groupId === 'global'
            ? (s.global = s.global || defaultGroup)
            : (s.games[groupId] =
                s.games?.[groupId] || defaultGroup);

        group.triggers = (group.triggers || []).map((t: any) =>
          t.id === updated.id ? updated : t,
        );

        module.updateSettings(s);

        forceUpdate();
      },
    };
  }

  get data(): any {
    return this.widgetData as any;
  }

  get settingsObject() {
    return this.settings as any;
  }

  get triggerGroups() {
    const s = this.settingsObject;
    if (!s) return {};
    const global = s.global;
    const games = Object.entries(s.games ?? {}).reduce((acc, [key, value]) => {
      if (value) acc[key] = value;
      return acc;
    }, {} as Record<string, any>);
    return { global, ...games };
  }

  // for game settings UI
  get gameSettings(): any[] {
    return Object.entries(this.data?.settings?.games ?? {}).map(
      ([gameId, gameData]) => ({
        gameId,
        ...(gameData ?? {
          enabled: false,
          triggers: [],
        }),
      }),
    );
  }

  get games(): { [key: string]: { title: string; camel: string } } {
    return (this.state?.staticConfig as any)?.data?.options?.games || {};
  }

  get availableGameEvents(): { [key: string]: string[] } {
    return (this.state?.staticConfig as any)?.data?.options?.available_game_events || {};
  }

  get gameEvents(): { [key: string]: string[] } {
    return (this.state?.staticConfig as any)?.data?.options?.game_events || {};
  }

  get globalEvents(): { [key: string]: string } {
    return (this.state?.staticConfig as any)?.data?.options?.global_events || {};
  }

  get streakTimePeriods(): { [key: string]: string } {
    return (this.state?.staticConfig as any)?.data?.options?.streak_time_periods || {};
  }

  // TODO$chris: extra helpers to implement later
  enableTrigger(triggerId: string) {}
  disableTrigger(triggerId: string) {}
  enableAllTriggers(groupId: string) {}
  disableAllTriggers(groupId: string) {}
  deleteTrigger(triggerId: string) {}
  previewTrigger(triggerId: string) {}
  toggleTrigger(triggerId: string) {}
  createTrigger(groupId: string, triggerData: Partial<IReactiveWidgetTrigger>) {}
}

export function useReactiveWidget() {
  return useWidget<ReactiveWidgetModule>();
}
