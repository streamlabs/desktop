
import { IWidgetCommonState, useWidget, WidgetModule } from '../common/useWidget';

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
  protected patchAfterFetch(data: any) {
    return data;
  }

  get data(): any {
    return (this.widgetData as any).data;
  }

  get triggerGroups() {
    if (!this.data?.settings) return {};
    const global = this.data?.settings?.global;
    const games = Object.entries(this.data?.settings?.games).reduce((acc, [key, value]) => {
      if (value) {
        acc[key] = value;
      }
      return acc;
    }, {} as Record<string, any>);
    return { global, ...games };
  }

  // for game settings UI
  get gameSettings(): any[] {
    return Object.entries(this.data?.settings?.games ?? {}).map(
      ([gameId, gameData]) => ({
        gameId,
        ...(
          gameData ?? {
            enabled: false,
            triggers: [],
          }
        ),
      })
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

  get globalEvents(): {[key: string]: string} {
    return (this.state?.staticConfig as any)?.data?.options?.global_events || {};
  }

  get streakTimePeriods(): { [key: string]: string } {
    return (this.state?.staticConfig as any)?.data?.options?.streak_time_periods || {};
  }

  enableTrigger(triggerId: string) {
    // TODO$chris
    if (triggerId === 'global') {

    } else {

    }
  }

  disableTrigger(triggerId: string) {
    // TODO$chris
    if (triggerId === 'global') {

    } else {
      
    }
  }

  enableAllTriggers(groupId: string) {
    // TODO$chris
    // e.g., groupId = 'global' or a game ID
  }

  disableAllTriggers(groupId: string) {
    // TODO$chris
  }

  deleteTrigger(triggerId: string) {
    // TODO$chris
  }

  previewTrigger(triggerId: string) {
    // TODO$chris
  }

  toggleTrigger(triggerId: string) {
    // TODO$chris
  }

  createTrigger(groupId: string, triggerData: Partial<IReactiveWidgetTrigger>) {
    // TODO$chris
  }
}

export function useReactiveWidget() {
  return useWidget<ReactiveWidgetModule>();
}