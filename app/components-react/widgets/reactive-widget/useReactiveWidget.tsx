import { IWidgetCommonState, useWidget, WidgetModule } from '../common/useWidget';
import { Inject } from 'services/core/injector';
import { HostsService } from 'services/hosts';
import cloneDeep from 'lodash/cloneDeep';
import { authorizedHeaders } from 'util/requests';
import { UserService } from 'services/user';

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

export const defaultTriggerSettings = {
  media_settings: {
    image_href: "https://cdn.streamlabs.com/library/giflibrary/jumpy-kevin.webm",
    sound_href: "https://cdn.streamlabs.com/static/sounds/bits.ogg",
    sound_volume: 50,
    show_animation: "fadeIn",
    hide_animation: "fadeOut"
  },
  text_settings: {
    font: "Open Sans",
    font_color: "#FFFFFF",
    font_color2: "#80F5D2",
    font_size: 24,
    font_weight: 400,
    message_template: "{number} kill streak!",
    text_animation: "bounce",
    text_delay_ms: 0
  },
  tts_settings: {
    enabled: false,
    include_message_template: true,
    language: "Salli",
    repetition_block_length: 1,
    security: 0,
    volume: 50
  },
  alert_duration_ms: 5000,
  amount_maximum: null,
  amount_minimum: 1,
  enabled: true,
  game_event: "kill",
  id: null, // server assigns ID
  name: "",
  layout: "above",
  type: "streak",
  streak_period: "session"
};

export class ReactiveWidgetModule extends WidgetModule<IReactiveWidgetState> {
  // add hostsService
  @Inject() hostsService: HostsService;
  @Inject() userService: UserService
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
  deleteTrigger(triggerId: string) {
    const url = `https://${this.hostsService.streamlabs}/api/v5/widgets/game-pulse/trigger?ulid=${triggerId}`;
    const headers = authorizedHeaders(this.userService.apiToken);
    headers.append('Content-Type', 'application/json');
    headers.append('Accept', 'application/json');
    return fetch(url, {
      method: 'DELETE',
      headers,
    }).then(async res => {
      if (!res.ok) {
        throw new Error(`Failed to delete trigger: ${res.status} ${await res.text()}`);
      }
      // TODO$chris: update local state to remove the trigger
    });
  }
  previewTrigger(triggerId: string) {}
  toggleTrigger(triggerId: string) {}
  async createTrigger({ eventType, game, name, triggerType }: { eventType: string; game: string; name: string; triggerType: string }) {
    const newTrigger = {
      ...defaultTriggerSettings,
      name,
      game_event: eventType,
      type: triggerType,
      media_settings: {
        ...defaultTriggerSettings.media_settings,
        image_href: this.generateDefaultMedia(eventType),
      },
      text_settings: {
        ...defaultTriggerSettings.text_settings,
        message_template: this.generateDefaultMessageTemplate(triggerType, eventType),
      },
    }
    const newSettings = { ...(this.data as any)?.settings || {} };
    if (game === 'global') {
      newSettings.global = {
        ...newSettings.global,
        triggers: [
          ...(newSettings.global?.triggers || []),
          newTrigger,
        ],
      };
    } else {
      if (!newSettings.games[game]) {
        newSettings.games[game] = { enabled: true, triggers: [] };
      }
      newSettings.games = {
        ...newSettings.games,
        [game]: {
          ...newSettings.games?.[game],
          triggers: [
            ...(newSettings.games?.[game]?.triggers || []),
            newTrigger,
          ],
        },
      };
    }
    await this.updateSettings(newSettings);
    await this.reload();
    // attempt to set the selected tab to the new trigger
    const triggerId = game === 'global'
      ? this.data.settings.global.triggers.slice(-1)[0].id
      : this.data.settings.games[game].triggers.slice(-1)[0].id;
    if (triggerId) {
      this.state.setSelectedTab(`${game}-trigger-${triggerId}`);
    }
  }

  protected generateDefaultMedia(eventType: string): string {
    switch (eventType) {
      case 'death':
        return 'https://cdn.streamlabs.com/library/animations/default-death.webm';
      case 'defeat':
        return 'https://cdn.streamlabs.com/library/animations/default-defeat.webm';
      case 'victory':
        return 'https://cdn.streamlabs.com/library/animations/default-victory.webm';
      case 'elimination':
        return 'https://cdn.streamlabs.com/library/animations/elimination.webm';
      default:
        return 'https://cdn.streamlabs.com/library/giflibrary/jumpy-kevin.webm';
    }
  }

  protected generateDefaultMessageTemplate(triggerType: string, eventType: string): string {
    const token = '{number}';
    if (triggerType === 'level') return `${eventType}: ${token}`;
    if (triggerType === 'streak') return `${token} ${eventType}`;
    return eventType;
  }
}

export function useReactiveWidget() {
  return useWidget<ReactiveWidgetModule>();
}
