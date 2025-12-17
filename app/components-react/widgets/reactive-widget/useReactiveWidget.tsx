import { IWidgetCommonState, useWidget, WidgetModule } from '../common/useWidget';
import cloneDeep from 'lodash/cloneDeep';
import {
  ReactiveWidgetSettings,
  ReactiveTrigger,
  IReactiveGroupOption,
  TabKind,
  ActiveTabContext,
  ReactiveTabUtils,
  buildNewTrigger,
  ReactiveTriggerType,
  ReactiveGameSettingsUI,
  ReactiveStaticConfig,
  ReactiveGameMeta,
  ReactiveEventMeta,
  ReactiveTriggerGroup,
} from './ReactiveWidget.helpers';

interface IReactiveWidgetState extends IWidgetCommonState {
  data: { settings: ReactiveWidgetSettings };
  staticConfig: ReactiveStaticConfig;
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
  private get hostsService() {
    return this.widgetsService.hostsService;
  }

  get staticConfig(): ReactiveStaticConfig | undefined {
    return (this.state?.staticConfig as unknown) as ReactiveStaticConfig | undefined;
  }

  get data(): IReactiveWidgetState['data'] {
    return this.widgetData;
  }

  get triggerGroups(): Record<string, ReactiveTriggerGroup> {
    const s = this.settings as ReactiveWidgetSettings;
    if (!s) return {};
    const global = s.global;
    const games = Object.entries(s.games ?? {}).reduce((acc, [key, value]) => {
      if (value) acc[key] = value;
      return acc;
    }, {} as Record<string, ReactiveTriggerGroup>);
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

  get games(): Record<string, ReactiveGameMeta> {
    return this.staticConfig?.data?.options?.games || {};
  }

  get availableGameEvents(): Record<string, string[]> {
    return this.staticConfig?.data?.options?.available_game_events || {};
  }

  get gameEvents(): Record<string, ReactiveEventMeta> {
    return this.staticConfig?.data?.options?.game_events || {};
  }

  get globalEvents(): { [key: string]: string } {
    return this.staticConfig?.data?.options?.global_events || {};
  }

  get groupOptions(): IReactiveGroupOption[] {
    const gamesMeta = this.games;

    const games = Object.entries(this.settings.games || {}).map(
      ([gameId, gameData]: [string, ReactiveTriggerGroup]) => ({
        id: gameId,
        name: gamesMeta?.[gameId]?.title || gameId,
        enabled: !!gameData?.enabled,
      }),
    );

    const global: IReactiveGroupOption = {
      id: 'global',
      name: 'Global',
      enabled: !!this.settings.global?.enabled,
    };

    return [global, ...games];
  }

  get groupMeta(): Record<string, ReactiveGameMeta> {
    return {
      global: { title: 'Global', camel: 'global' },
      ...this.games,
    };
  }

  get activeTabContext(): ActiveTabContext {
    const tab = this.state?.selectedTab;
    const context = ReactiveTabUtils.parse(tab);

    if (context.kind === TabKind.General && typeof tab !== 'string') {
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
  private updateTriggers(groupId: string, updater: (trigger: ReactiveTrigger) => ReactiveTrigger) {
    const isGlobal = groupId === 'global';
    const groupSettings = this.getGroup(groupId) || { enabled: true, triggers: [] };
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
  public createTriggerBinding(groupId: string, triggerId: string, forceUpdate: () => unknown) {
    const module = this;

    return {
      get trigger(): ReactiveTrigger | null {
        return module.getTrigger(groupId, triggerId);
      },

      updateTrigger(updated: ReactiveTrigger) {
        const settings = cloneDeep(module.settings);
        const defaultGroup = { enabled: true, triggers: [] };
        const group =
          groupId === 'global'
            ? (settings.global = settings.global || defaultGroup)
            : (settings.games[groupId] = settings.games?.[groupId] || defaultGroup);

        group.triggers = (group.triggers || []).map((t: ReactiveTrigger) =>
          t.id === updated.id ? updated : t,
        );

        module.updateSettings(settings);

        forceUpdate();
      },
    };
  }

  /** Enable a single trigger by ID within the given group. */
  public enableTrigger(groupId: string, triggerId: string) {
    this.updateTriggers(groupId, trigger =>
      trigger.id === triggerId ? { ...trigger, enabled: true } : trigger,
    );
  }

  /** Disable a single trigger by ID within the given group. */
  public disableTrigger(groupId: string, triggerId: string) {
    this.updateTriggers(groupId, trigger =>
      trigger.id === triggerId ? { ...trigger, enabled: false } : trigger,
    );
  }

  /**Enable every trigger in the specified group. */
  public enableAllTriggers(groupId: string) {
    this.updateTriggers(groupId, trigger => ({
      ...trigger,
      enabled: true,
    }));
  }

  /** Disable every trigger in the specified group. */
  public disableAllTriggers(groupId: string) {
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
  public toggleTrigger(groupId: string, triggerId: string, enabled?: boolean): void {
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
  public setGroupEnabled(groupId: string, enabled: boolean) {
    const newSettings: ReactiveWidgetSettings = cloneDeep(this.settings) as ReactiveWidgetSettings;
    const group = this.getGroup(groupId, newSettings) || { triggers: [] };

    if (groupId === 'global') {
      newSettings.global = {
        ...group,
        enabled,
      };
    } else {
      newSettings.games = {
        ...(newSettings.games || {}),
        [groupId]: {
          ...group,
          enabled,
        },
      };
    }

    this.updateSettings(newSettings);
  }

  /** Enable all trigger groups at once. */
  public enableAllGroups() {
    const games = this.settings.games || {};
    const newGames: Record<string, ReactiveTriggerGroup> = {};

    Object.keys(games).forEach(gameId => {
      newGames[gameId] = {
        ...(games[gameId] || {}),
        triggers: games[gameId]?.triggers || [],
        enabled: true,
      };
    });

    const newSettings: ReactiveWidgetSettings = {
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
  public disableAllGroups() {
    const games = this.settings.games || {};
    const newGames: Record<string, ReactiveTriggerGroup> = {};

    Object.keys(games).forEach(gameId => {
      newGames[gameId] = {
        ...(games[gameId] || {}),
        triggers: games[gameId]?.triggers || [],
        enabled: false,
      };
    });

    const newSettings: ReactiveWidgetSettings = {
      ...this.settings,
      global: {
        ...(this.settings.global || {}),
        enabled: false,
      },
      games: newGames,
    };

    this.updateSettings(newSettings);
  }

  public async deleteTrigger(triggerId: string) {
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
      // const group = groupId === 'global' ? newSettings.global : newSettings.games?.[groupId];
      const group = this.getGroup(groupId, newSettings);
      if (!group || !group.triggers) continue;

      const triggerIndex = group.triggers.findIndex(t => t.id === triggerId);
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
   * - Generates a new trigger object using `buildNewTrigger`.
   * - Appends the new trigger to the settings via `appendTriggerToSettings`.
   * - Persists the updated settings to the backend via `updateSettings`.
   * - Refreshes the local data state by calling `fetchData`.
   * - Switches the selected UI tab to the newly created trigger by resolving the ID of the last added entry.
   *
   * @param eventType   The event key to attach the trigger to (e.g. `'victory'`, `'elimination'`).
   * @param game        The group id: `'global'` or a specific game id.
   * @param name        Display name for the trigger (already made unique per game by the form).
   * @param triggerType The trigger type (e.g. `'streak'`, `'achievement'`, `'level'`).
   */
  // TODO:$chris: add typing for params
  public async createTrigger({
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
    const newTrigger = buildNewTrigger({
      triggerType,
      eventKey: eventType,
      name,
    });

    const newSettings = this.appendTriggerToSettings(this.settings, game, newTrigger);
    await this.updateSettings(newSettings);
    this.setData(await this.fetchData());

    const triggerId = this.getTriggers(game)?.at(-1)?.id;
    if (triggerId) {
      this.state.setSelectedTab(ReactiveTabUtils.generateTriggerId(game, triggerId));
    }
  }

  /** Helper to append a new trigger to the correct group in settings. Either global or a specific game group */
  private appendTriggerToSettings(
    settings: ReactiveWidgetSettings,
    groupId: string,
    trigger: ReactiveTrigger,
  ): ReactiveWidgetSettings {
    const nextSettings = cloneDeep(settings) as ReactiveWidgetSettings;

    if (groupId === 'global') {
      const global = nextSettings.global || { enabled: true, triggers: [] };
      nextSettings.global = {
        ...global,
        triggers: [...(global.triggers || []), trigger],
      };
      return nextSettings;
    }

    const games = nextSettings.games || {};
    const group = (games[groupId] as ReactiveTriggerGroup) || {
      enabled: true,
      triggers: [],
    };

    nextSettings.games = {
      ...games,
      [groupId]: {
        ...group,
        triggers: [...(group.triggers || []), trigger],
      },
    };

    return nextSettings;
  }

  private getGroup(game: string, settings = this.settings) {
    return game === 'global' ? settings.global : settings.games?.[game];
  }

  /** Get all triggers for a specific group. */
  public getTriggers(game: string): ReactiveTrigger[] {
    const group = this.getGroup(game);
    return group?.triggers ?? [];
  }

  /** Get a specific trigger by ID within a group. Returns null if not found. */
  public getTrigger(game: string, triggerId: string): ReactiveTrigger | null {
    const group = this.getGroup(game);
    if (!group) return null;
    return group.triggers.find(t => t.id === triggerId) ?? null;
  }
}

export function useReactiveWidget() {
  return useWidget<ReactiveWidgetModule>();
}
