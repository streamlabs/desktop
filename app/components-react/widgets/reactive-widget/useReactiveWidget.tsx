import { IWidgetCommonState, useWidget, WidgetModule } from '../common/useWidget';
import cloneDeep from 'lodash/cloneDeep';

interface IReactiveWidgetState extends IWidgetCommonState {
  data: { settings: ReactiveWidgetSettings }; // TODO$chris: define settings structure
}

type ReactiveTriggerType = 'streak' | 'achievement';
type ReactiveLayout = 'above' | 'banner' | 'side';
type ReactiveStreakPeriod = 'session' | 'today' | 'round';

interface IReactiveGroupOption {
  id: string;
  name: string;
  enabled: boolean;
}

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
  font_weight: number;
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
  id: string | null; // server assigns ID, null for new triggers
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
  amount_maximum?: number | null;
}

interface ReactiveAchievementTrigger extends ReactiveBaseTrigger {
  type: 'achievement';
  streak_period?: undefined; // TODO$chris: update these
  amount_minimum?: undefined;
  amount_maximum?: undefined;
}

type ReactiveTrigger = ReactiveStreakTrigger | ReactiveAchievementTrigger;
export type ReactiveWidgetTabKind =
  | 'add-trigger'
  | 'general'
  | 'game-manage-trigger'
  | 'trigger-detail';
interface ReactiveTriggerGroup {
  enabled: boolean;
  triggers: ReactiveTrigger[]; // may be empty
}

export type ReactiveGamesMap = Record<string, ReactiveTriggerGroup | null | undefined>;

export type IReactiveWidgetTrigger = ReactiveStreakTrigger | ReactiveAchievementTrigger;
export interface ReactiveWidgetSettings {
  background_color: string;
  interrupt_mode: boolean;
  is_muted: boolean;
  global: ReactiveTriggerGroup;
  games: ReactiveGamesMap;
}

export const defaultTriggerSettings: ReactiveTrigger = {
  media_settings: {
    image_href: 'https://cdn.streamlabs.com/library/giflibrary/jumpy-kevin.webm',
    sound_href: 'https://cdn.streamlabs.com/static/sounds/bits.ogg',
    sound_volume: 50,
    show_animation: 'fadeIn',
    hide_animation: 'fadeOut',
  },
  text_settings: {
    font: 'Open Sans',
    font_color: '#FFFFFF',
    font_color2: '#80F5D2',
    font_size: 24,
    font_weight: 400,
    message_template: '{number} kill streak!',
    text_animation: 'bounce',
    text_delay_ms: 0,
  },
  tts_settings: {
    enabled: false,
    include_message_template: true,
    language: 'Salli',
    repetition_block_length: 1,
    security: 0,
    volume: 50,
  },
  alert_duration_ms: 5000,
  amount_maximum: null,
  amount_minimum: 1,
  enabled: true,
  game_event: 'kill',
  id: null, // server assigns ID
  name: '',
  layout: 'above',
  type: 'streak',
  streak_period: 'session',
};

/**
 * Reactive widget module for Game Pulse triggers.
 *
 * Concepts:
 * - "Group": either 'global' or a specific game id
 * - "Trigger": per-event alert configuration (streak or achievement)
 *
 * This module:
 * - normalizes widget settings data
 * - exposes group/trigger metadata for the UI
 * - manages trigger CRUD and enable/disable state
 */
export class ReactiveWidgetModule extends WidgetModule<IReactiveWidgetState> {
  get hostsService() {
    return this.widgetsService.hostsService;
  }

  get data(): IReactiveWidgetState['data'] {
    return this.widgetData;
  }

  get triggerGroups() {
    const s = this.settings as any;
    if (!s) return {};
    const global = s.global;
    const games = Object.entries(s.games ?? {}).reduce((acc, [key, value]) => {
      if (value) acc[key] = value;
      return acc;
    }, {} as Record<string, any>);
    return { global, ...games };
  }

  get gameSettings(): any[] {
    return Object.entries(this.data?.settings?.games ?? {}).map(([gameId, gameData]) => ({
      gameId,
      ...(gameData ?? {
        enabled: false,
        triggers: [],
      }),
    }));
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

  get groupOptions(): IReactiveGroupOption[] {
    const data = (this.data as any) ?? {};
    const settings = data.settings ?? {};
    const gamesMeta = this.games;

    const games = Object.entries(settings.games || {}).map(([gameId, gameData]: [string, any]) => ({
      id: gameId,
      name: gamesMeta?.[gameId]?.title || gameId,
      enabled: !!gameData?.enabled,
    }));

    const global: IReactiveGroupOption = {
      id: 'global',
      name: 'Global',
      enabled: !!settings.global?.enabled,
    };

    return [global, ...games];
  }

  get groupMeta() {
    return {
      global: { title: 'Global', camel: 'global' },
      ...this.games,
    };
  }

  get tabKind(): ReactiveWidgetTabKind {
    const selectedTab = this.state?.selectedTab;

    if (!selectedTab) return 'game-manage-trigger'; // default fallback

    if (selectedTab === 'add-trigger') return 'add-trigger';
    if (selectedTab === 'general') return 'general';
    if (selectedTab.endsWith('-manage-trigger')) return 'game-manage-trigger';
    if (selectedTab.includes('-trigger-')) return 'trigger-detail';

    return 'game-manage-trigger';
  }

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
    const settings = this.settings as any;
    if (!settings) return null;

    const group = groupId === 'global' ? settings.global : settings.games?.[groupId];

    if (!group) return null;

    return (group.triggers || []).find((t: any) => t.id === triggerId) || null;
  }

  /**
   * Internal helper for modifying triggers within a specific group.
   *
   * Behavior:
   *  - Resolves the group from settings (`global` or a game id)
   *  - Falls back to a default `{ enabled: true, triggers: [] }` group if none exists
   *  - Maps each trigger through the `updater` callback
   *  - Writes the updated group back into widget settings
   *  - Calls `updateSettings()` to persist the change
   *
   * Used by high-level operations such as:
   *  - `enableTrigger`, `disableTrigger`
   *  - `toggleTrigger`
   *  - `enableAllTriggers`, `disableAllTriggers`
   *
   * This method does **not**:
   *  - create new triggers
   *  - remove triggers
   *  - modify other groups
   *
   * @param groupId The owning group (`'global'` or a game id).
   * @param updater A function that receives a trigger and returns the updated trigger.
   */
  private updateTriggers(
    groupId: string,
    updater: (trigger: IReactiveWidgetTrigger) => IReactiveWidgetTrigger,
  ) {
    const currentSettings = ((this.data as any)?.settings ?? {}) as any;
    const isGlobal = groupId === 'global';

    const groupSettings = isGlobal
      ? currentSettings.global || { enabled: true, triggers: [] }
      : currentSettings.games?.[groupId] || { enabled: true, triggers: [] };

    const updatedGroupSettings = {
      ...groupSettings,
      triggers: (groupSettings.triggers || []).map(updater),
    };

    const newSettings: any = {
      ...currentSettings,
      ...(isGlobal
        ? { global: updatedGroupSettings }
        : {
            games: {
              ...(currentSettings.games || {}),
              [groupId]: updatedGroupSettings,
            },
          }),
    };

    this.updateSettings(newSettings);
  }

  /**
   * Create a reactive binding for a specific trigger within a group.
   *
   * Returns an object exposing:
   *  - `trigger` — a getter that resolves the latest trigger data
   *    from settings (or `null` if it no longer exists)
   *  - `updateTrigger(updated)` — persists changes to that trigger
   *    in the widget settings and forces a UI refresh
   *
   * This is used to edit a single trigger
   *
   * `forceUpdate` is required because React state is not automatically
   * updated by changes to the underlying widget store.
   *
   * @param groupId    The owning group (`'global'` or a game id).
   * @param triggerId  The trigger ULID within that group.
   * @param forceUpdate Callback to re-render the consuming component once updated.
   */
  createTriggerBinding(groupId: string, triggerId: string, forceUpdate: () => unknown) {
    const module = this;

    return {
      get trigger(): IReactiveWidgetTrigger | null {
        return module.findTrigger(groupId, triggerId) as IReactiveWidgetTrigger | null;
      },

      updateTrigger(updated: IReactiveWidgetTrigger) {
        const settings = cloneDeep(module.settings) as any;
        const defaultGroup = { enabled: true, triggers: [] };
        const group =
          groupId === 'global'
            ? (settings.global = settings.global || defaultGroup)
            : (settings.games[groupId] = settings.games?.[groupId] || defaultGroup);

        group.triggers = (group.triggers || []).map((t: any) =>
          t.id === updated.id ? updated : t,
        );

        module.updateSettings(settings);

        forceUpdate();
      },
    };
  }

  /** Enable a single trigger by ID within the given group. */
  enableTrigger(groupId: string, triggerId: string) {
    this.updateTriggers(groupId, trigger =>
      trigger.id === triggerId ? { ...trigger, enabled: true } : trigger,
    );
  }

  /** Disable a single trigger by ID within the given group. */
  disableTrigger(groupId: string, triggerId: string) {
    this.updateTriggers(groupId, trigger =>
      trigger.id === triggerId ? { ...trigger, enabled: false } : trigger,
    );
  }

  /**Enable every trigger in the specified group. */
  enableAllTriggers(groupId: string) {
    this.updateTriggers(groupId, trigger => ({
      ...trigger,
      enabled: true,
    }));
  }

  /** Disable every trigger in the specified group. */
  disableAllTriggers(groupId: string) {
    this.updateTriggers(groupId, trigger => ({
      ...trigger,
      enabled: false,
    }));
  }

  /**
   * Enable/disable a single trigger within a group.
   *
   * If `enabled` is provided, the trigger's `enabled` flag is set to that value
   * (e.g. from the checkbox in `ReactiveWidgetMenu`). If `enabled` is omitted,
   * the current `enabled` state is toggled.
   *
   * @param groupId   Group that owns the trigger (`'global'` or a game id).
   * @param triggerId ID of the trigger to update.
   * @param enabled   Optional explicit enabled state. When omitted, the state is flipped.
   */
  toggleTrigger(groupId: string, triggerId: string, enabled?: boolean) {
    this.updateTriggers(groupId, trigger => {
      if (trigger.id !== triggerId) return trigger;
      return {
        ...trigger,
        enabled: typeof enabled === 'boolean' ? enabled : !trigger.enabled,
      };
    });
  }

  /**
   * Enable or disable an entire trigger group.
   *
   * A "group" represents either:
   *  - `'global'` — settings that apply to all games, or
   *  - a specific game id — settings scoped to that game.
   *
   * This updates the group's `enabled` flag without modifying its triggers.
   * Used by the Game Settings UI to toggle whether a group's triggers
   * are considered active.
   *
   * @param groupId The group to update (`'global'` or a game id).
   * @param enabled Whether the group should be enabled (true) or disabled (false).
   */
  setGroupEnabled(groupId: string, enabled: boolean) {
    const settings = ((this.data as any)?.settings ?? {}) as any;
    const newSettings: any = { ...settings };

    if (groupId === 'global') {
      newSettings.global = {
        ...(newSettings.global || {}),
        enabled,
      };
    } else {
      const games = newSettings.games || {};
      const group = games[groupId] || {};
      newSettings.games = {
        ...games,
        [groupId]: {
          ...group,
          enabled,
        },
      };
    }

    this.updateSettings(newSettings);
  }

  /** Enable all trigger groups at once. */
  enableAllGroups() {
    const settings = ((this.data as any)?.settings ?? {}) as any;
    const games = settings.games || {};
    const newGames: any = {};

    Object.keys(games).forEach(gameId => {
      newGames[gameId] = {
        ...(games[gameId] || {}),
        enabled: true,
      };
    });

    const newSettings: any = {
      ...settings,
      global: {
        ...(settings.global || {}),
        enabled: true,
      },
      games: newGames,
    };

    this.updateSettings(newSettings);
  }

  /** Disable all trigger groups at once. */
  disableAllGroups() {
    const settings = ((this.data as any)?.settings ?? {}) as any;
    const games = settings.games || {};
    const newGames: any = {};

    Object.keys(games).forEach(gameId => {
      newGames[gameId] = {
        ...(games[gameId] || {}),
        enabled: false,
      };
    });

    const newSettings: any = {
      ...settings,
      global: {
        ...(settings.global || {}),
        enabled: false,
      },
      games: newGames,
    };

    this.updateSettings(newSettings);
  }

  previewTrigger(triggerId: string) {
    // TODO$chris: implement if needed
  }

  /**
   * Permanently delete a trigger from the backend.
   *
   * @param triggerId The id of the trigger to delete.
   * @throws Error if the API call fails.
   */
  async deleteTrigger(triggerId: string) {
    const url = `https://${this.hostsService.streamlabs}/api/v5/widgets/desktop/game-pulse/trigger?ulid=${triggerId}`;
    const res = await this.widgetsService.request({
      url,
      method: 'DELETE',
    });
    if (!res.success) {
      throw new Error(`Failed to delete trigger: ${res.message}`);
    }
    // TODO$chris: update local state to remove the trigger
  }

  /**
   * Create a new trigger in the specified group (`global` or a game id).
   *
   * This:
   *  - builds a trigger object from `defaultTriggerSettings`
   *  - sets the trigger's `name`, `game_event` (eventType), and `type` (triggerType)
   *  - derives default `media_settings.image_href` via `generateDefaultMedia(eventType)`
   *  - derives default `text_settings.message_template` via
   *    `generateDefaultMessageTemplate(triggerType, eventType)`
   *  - appends the trigger to either:
   *      - `settings.global.triggers` when `game === 'global'`, or
   *      - `settings.games[game].triggers` for a specific game group
   *  - persists the updated settings with `updateSettings()`
   *  - reloads widget data with `reload()`
   *  - and finally switches the selected tab to the newly created trigger
   *    (e.g. `${game}-trigger-${triggerId}`) if it can be resolved.
   *
   * @param eventType   The event key to attach the trigger to (e.g. `'victory'`, `'elimination'`).
   * @param game        The group id: `'global'` or a specific game id.
   * @param name        Display name for the trigger (already made unique per game by the form).
   * @param triggerType The trigger type (e.g. `'streak'`, `'achievement'`, `'level'`).
   */
  async createTrigger({
    eventType,
    game,
    name,
    triggerType,
  }: {
    eventType: string;
    game: string;
    name: string;
    triggerType: string;
  }) {
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
    };

    const newSettings: any = { ...((this.data as any)?.settings || {}) };

    if (game === 'global') {
      newSettings.global = {
        ...newSettings.global,
        triggers: [...(newSettings.global?.triggers || []), newTrigger],
      };
    } else {
      const games = newSettings.games || {};
      const existingGroup = games[game] || { enabled: true, triggers: [] };

      newSettings.games = {
        ...games,
        [game]: {
          ...existingGroup,
          triggers: [...(existingGroup.triggers || []), newTrigger],
        },
      };
    }

    await this.updateSettings(newSettings);
    await this.reload();

    // attempt to set the selected tab to the new trigger
    const triggerId =
      game === 'global'
        ? this.data.settings.global.triggers.slice(-1)[0].id
        : this.data.settings.games?.[game]?.triggers.slice(-1)[0].id;

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
