import { IWidgetCommonState, useWidget, WidgetModule } from '../common/useWidget';
import cloneDeep from 'lodash/cloneDeep';
import {
  ReactiveWidgetSettings,
  ReactiveTrigger,
  IReactiveGroupOption,
  TabKind,
  ActiveTabContext,
  ReactiveTabUtils,
  generateTriggerSettings,
  ReactiveTriggerType,
  ReactiveGameSettingsUI,
} from './ReactiveWidget.helpers';

interface IReactiveWidgetState extends IWidgetCommonState {
  data: { settings: ReactiveWidgetSettings };
}

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
    const s = this.settings as ReactiveWidgetSettings;
    if (!s) return {};
    const global = s.global;
    const games = Object.entries(s.games ?? {}).reduce((acc, [key, value]) => {
      if (value) acc[key] = value;
      return acc;
    }, {} as Record<string, any>);
    return { global, ...games };
  }

  get gameSettings(): ReactiveGameSettingsUI[] {
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
    const gamesMeta = this.games;

    const games = Object.entries(this.settings.games || {}).map(([gameId, gameData]: [string, any]) => ({
      id: gameId,
      name: gamesMeta?.[gameId]?.title || gameId,
      enabled: !!gameData?.enabled,
    }));

    const global: IReactiveGroupOption = {
      id: 'global',
      name: 'Global',
      enabled: !!this.settings.global?.enabled,
    };

    return [global, ...games];
  }

  get groupMeta() {
    return {
      global: { title: 'Global', camel: 'global' },
      ...this.games,
    };
  }

  get activeTabContext(): ActiveTabContext {
    const tab = this.state?.selectedTab;
    const context = ReactiveTabUtils.parse(tab);

    if (context.kind === 'general' && typeof tab !== 'string') {
      const firstGameId = Object.keys(this.data?.settings?.games || {})[0];
      return firstGameId
        ? { kind: TabKind.GameManage, gameId: firstGameId }
        : { kind: TabKind.General };
    }

    return context;
  }

  get tabKind(): TabKind {
    return this.activeTabContext.kind;
  }

  protected patchBeforeSend(settings: ReactiveWidgetSettings) {
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
    const settings = this.settings as ReactiveWidgetSettings;
    if (!settings) return null;

    const group = groupId === 'global' ? settings.global : settings.games?.[groupId];

    if (!group) return null;

    return (group.triggers || []).find((t: ReactiveTrigger) => t.id === triggerId) || null;
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
    updater: (trigger: ReactiveTrigger) => ReactiveTrigger,
  ) {
    const isGlobal = groupId === 'global';

    const groupSettings = isGlobal
      ? this.settings.global || { enabled: true, triggers: [] }
      : this.settings.games?.[groupId] || { enabled: true, triggers: [] };

    const updatedGroupSettings = {
      ...groupSettings,
      triggers: (groupSettings.triggers || []).map(updater),
    };

    const newSettings: ReactiveWidgetSettings = {
      ...this.settings,
      ...(isGlobal
        ? { global: updatedGroupSettings }
        : {
            games: {
              ...(this.settings.games || {}),
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
      get trigger(): ReactiveTrigger | null {
        return module.findTrigger(groupId, triggerId) as ReactiveTrigger | null;
      },

      updateTrigger(updated: ReactiveTrigger) {
        const settings = cloneDeep(module.settings);
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
    const newSettings: any = { ...this.settings };

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
    const games = this.settings.games || {};
    const newGames: any = {};

    Object.keys(games).forEach(gameId => {
      newGames[gameId] = {
        ...(games[gameId] || {}),
        enabled: true,
      };
    });

    const newSettings: any = {
      ...this.settings,
      global: {
        ...(this.settings.global || {}),
        enabled: true,
      },
      games: newGames,
    };

    this.updateSettings(newSettings);
  }

  /** Disable all trigger groups at once. */
  disableAllGroups() {
    const games = this.settings.games || {};
    const newGames: any = {};

    Object.keys(games).forEach(gameId => {
      newGames[gameId] = {
        ...(games[gameId] || {}),
        enabled: false,
      };
    });

    const newSettings: any = {
      ...this.settings,
      global: {
        ...(this.settings.global || {}),
        enabled: false,
      },
      games: newGames,
    };

    this.updateSettings(newSettings);
  }

  async deleteTrigger(triggerId: string) {
    const url = `https://${this.hostsService.streamlabs}/api/v5/widgets/desktop/game-pulse/trigger?ulid=${triggerId}`;
    const res = await this.widgetsService.request({
      url,
      method: 'DELETE',
    });
    if (!res.success) {
      throw new Error(`Failed to delete trigger: ${res.message}`);
    }

    const newSettings = cloneDeep(this.settings) as ReactiveWidgetSettings;
    
    // remove the trigger from whichever group it belongs to
    const groups = ['global', ...Object.keys(newSettings.games || {})];
    for (const groupId of groups) {
      const group = groupId === 'global' ? newSettings.global : newSettings.games?.[groupId];
      if (!group || !group.triggers) continue;

      const triggerIndex = group.triggers.findIndex((t) => t.id === triggerId);
      if (triggerIndex !== -1) {
        group.triggers.splice(triggerIndex, 1);
        break;
      }
    }

    await this.replaceSettings(newSettings);

    // if the deleted trigger was selected, switch to General tab
    const { activeTabContext } = this;
    const { triggerId: selectedTriggerId, kind } = activeTabContext;
    if (kind === TabKind.TriggerDetail && selectedTriggerId === triggerId) {
      this.state.setSelectedTab(ReactiveTabUtils.ID_GENERAL);
    }
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
    triggerType: ReactiveTriggerType;
  }) {
    const baseSettings = generateTriggerSettings(triggerType);
    const newTrigger: ReactiveTrigger = {
      ...baseSettings,
      name,
      game_event: eventType,
      media_settings: {
        ...baseSettings.media_settings,
        image_href: this.generateDefaultMedia(eventType),
      },
      text_settings: {
        ...baseSettings.text_settings,
        message_template: this.generateDefaultMessageTemplate(triggerType, eventType),
      },
    };

    const newSettings = cloneDeep(this.settings) as ReactiveWidgetSettings;

    if (game === 'global') {
      newSettings.global = {
        ...newSettings.global,
        triggers: [...(newSettings.global.triggers || []), newTrigger],
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
    this.setData(await this.fetchData());

    // attempt to set the selected tab to the new trigger
    const triggerId =
      game === 'global'
        ? this.data.settings.global.triggers.slice(-1)[0].id
        : this.data.settings.games?.[game]?.triggers.slice(-1)[0].id;

    if (triggerId) {
      this.state.setSelectedTab(
        ReactiveTabUtils.generateTriggerId(game, triggerId),
      );
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
