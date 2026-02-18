import { Throttle, Bind } from 'lodash-decorators';
import cloneDeep from 'lodash/cloneDeep';
import { useWidget, WidgetModule } from '../common/useWidget';
import { GamePulseTabUtils, buildNewTrigger, sortEventKeys, delay } from './GamePulse.helpers';
import { GAME_PULSE_API } from './GamePulse.consts';

import {
  ScopeId,
  GamePulseWidgetSettings,
  GamePulseTrigger,
  IGamePulseGroupOption,
  TabKind,
  ActiveTabContext,
  TriggerType,
  GamePulseStaticConfig,
  GamePulseGameMeta,
  GamePulseEventMeta,
  GamePulseTriggerGroup,
  IGamePulseWidgetState,
} from './GamePulse.types';

/**
 * Game Pulse widget module for Game Pulse triggers.
 *
 * Concepts:
 * - "scope": either 'global' or a specific game id
 * - "Trigger": per-event alert configuration (streak, achievement, level, etc.)
 *
 * This module:
 * - normalizes widget settings data
 * - exposes group/trigger metadata for the UI
 * - manages trigger CRUD and enable/disable state
 */
export class GamePulseModule extends WidgetModule<IGamePulseWidgetState> {
  /** Tracks the last save operation to ensure sequential updates */
  private _lastSavePromise: Promise<any> = Promise.resolve();
  private get hostsService() {
    return this.widgetsService.hostsService;
  }

  get staticConfig(): GamePulseStaticConfig | undefined {
    return this.state?.staticConfig as GamePulseStaticConfig | undefined;
  }

  get games(): Record<string, GamePulseGameMeta> {
    return this.staticConfig?.data?.options?.games || {};
  }

  get availableGameEvents(): Record<string, string[]> {
    const raw = this.staticConfig?.data?.options?.available_game_events || {};
    return Object.keys(raw).reduce((acc, gameKey) => {
      acc[gameKey] = [...raw[gameKey]].sort(sortEventKeys);
      return acc;
    }, {} as Record<string, string[]>);
  }

  get gameEvents(): Record<string, GamePulseEventMeta> {
    return this.staticConfig?.data?.options?.game_events || {};
  }

  get globalEvents(): { [key: string]: string } {
    const rawGlobal = this.staticConfig?.data?.options?.global_events || {};
    const sortedKeys = Object.keys(rawGlobal).sort(sortEventKeys);

    return sortedKeys.reduce((acc, key) => {
      acc[key] = rawGlobal[key];
      return acc;
    }, {} as Record<string, string>);
  }

  get groupOptions(): IGamePulseGroupOption[] {
    const gamesMeta = this.games;

    const games = Object.entries(this.settings.games || {}).map(([gameId, gameData]) => ({
      id: gameId,
      name: gamesMeta?.[gameId]?.title || gameId,
      enabled: !!gameData?.enabled,
    }));

    const global: IGamePulseGroupOption = {
      id: ScopeId.Global,
      name: 'Global',
      enabled: !!this.settings.global?.enabled,
    };

    return [global, ...games];
  }

  get sections(): { id: string; title: string; triggers: GamePulseTrigger[] }[] {
    const globalSection = {
      id: ScopeId.Global,
      title: 'Global',
      triggers: this.settings?.global?.triggers || [],
    };

    const gameSections = Object.entries(this.games).flatMap(([gameKey, gameMeta]) => {
      const triggers = this.settings?.games?.[gameKey]?.triggers || [];
      if (triggers.length === 0) return [];
      return [
        {
          id: gameKey,
          title: gameMeta.title,
          triggers,
        },
      ];
    });

    return [globalSection, ...gameSections];
  }

  get currentTabId(): string {
    return this.state?.selectedTab || GamePulseTabUtils.generateManageGameId(ScopeId.Global);
  }

  get activeTabContext(): ActiveTabContext {
    return GamePulseTabUtils.parse(this.currentTabId);
  }

  get tabKind(): TabKind {
    return this.activeTabContext.kind;
  }

  get hasTriggers(): boolean {
    return this.hasTriggersFn(this.settings);
  }

  hasTriggersFn(settings: GamePulseWidgetSettings): boolean {
    const globalTriggers = settings?.global?.triggers || [];
    const gameTriggers = Object.values(settings?.games || {}).flatMap(
      group => group?.triggers || [],
    );

    return globalTriggers.length + gameTriggers.length > 0;
  }

  protected patchBeforeSend(settings: GamePulseWidgetSettings) {
    return settings;
  }

  /**
   * normalizes the API response so WidgetModule sees `{ settings: ... }`.
   * raw is something like: { success, message, data: { ..., settings }, settings? }
   */
  protected patchAfterFetch(raw: any) {
    const settings = raw.settings ?? raw.data?.settings ?? {};
    return {
      settings,
      showOnboarding: raw.data?.show_onboarding ?? false,
      showTutorial: raw.data?.show_tutorial ?? false,
    };
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
   * @param scopeId The owning group (`'global'` or a game id).
   * @param updater A function that receives a trigger and returns the updated trigger.
   */
  private updateTriggers(
    scopeId: string,
    updater: (trigger: GamePulseTrigger) => GamePulseTrigger,
  ) {
    const isGlobal = scopeId === ScopeId.Global;
    const groupSettings = this.getScope(scopeId) || { enabled: true, triggers: [] };
    const updatedGroupSettings = {
      ...groupSettings,
      triggers: (groupSettings.triggers || []).map(updater),
    };

    const newSettings: GamePulseWidgetSettings = {
      ...this.settings,
      ...(isGlobal
        ? { global: updatedGroupSettings }
        : {
            games: {
              ...(this.settings.games || {}),
              [scopeId]: updatedGroupSettings,
            },
          }),
    };

    this._lastSavePromise = this.updateSettings(newSettings);
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
   * @param scopeId    The owning group (`'global'` or a game id).
   * @param triggerId  The trigger ULID within that group.
   * @param forceUpdate Callback to re-render the consuming component once updated.
   */
  public createTriggerBinding(scopeId: string, triggerId: string, forceUpdate: () => unknown) {
    const module = this;

    return {
      get trigger(): GamePulseTrigger | null {
        return module.getTrigger(scopeId, triggerId);
      },

      updateTrigger(updated: GamePulseTrigger) {
        module.updateTriggers(scopeId, t => (t.id === updated.id ? updated : t));
        forceUpdate();
      },
    };
  }

  /** Enable a single trigger by ID within the given group. */
  public enableTrigger(scopeId: string, triggerId: string) {
    this.updateTriggers(scopeId, trigger =>
      trigger.id === triggerId ? { ...trigger, enabled: true } : trigger,
    );
  }

  /** Disable a single trigger by ID within the given group. */
  public disableTrigger(scopeId: string, triggerId: string) {
    this.updateTriggers(scopeId, trigger =>
      trigger.id === triggerId ? { ...trigger, enabled: false } : trigger,
    );
  }

  /**Enable every trigger in the specified group. */
  public enableAllTriggers(scopeId: string) {
    this.updateTriggers(scopeId, trigger => ({
      ...trigger,
      enabled: true,
    }));
  }

  /** Disable every trigger in the specified group. */
  public disableAllTriggers(scopeId: string) {
    this.updateTriggers(scopeId, trigger => ({
      ...trigger,
      enabled: false,
    }));
  }

  /**
   * Enable/disable a single trigger within a group.
   *
   * If `enabled` is provided, the trigger's `enabled` flag is set to that value
   * (e.g. from the checkbox in `GamePulseWidgetMenu`). If `enabled` is omitted,
   * the current `enabled` state is toggled.
   *
   * @param scopeId   Group that owns the trigger (`'global'` or a game id).
   * @param triggerId ID of the trigger to update.
   * @param enabled   Optional explicit enabled state. When omitted, the state is flipped.
   */
  public toggleTrigger(scopeId: string, triggerId: string, enabled?: boolean): void {
    this.updateTriggers(scopeId, trigger => {
      if (trigger.id !== triggerId) return trigger;
      return {
        ...trigger,
        enabled: typeof enabled === 'boolean' ? enabled : !trigger.enabled,
      };
    });
  }

  /**
   * Enable or disable an entire trigger scope.
   *
   * A "scope" represents either:
   *  - `'global'` — settings that apply to all games, or
   *  - a specific game id — settings scoped to that game.
   *
   * This updates the scope's `enabled` flag without modifying its triggers.
   * Used by the Game Settings UI to toggle whether a scope's triggers
   * are considered active.
   *
   * @param scopeId The scope to update (`'global'` or a game id).
   * @param enabled Whether the scope should be enabled (true) or disabled (false).
   */
  public toggleScope(scopeId: string, enabled: boolean) {
    const newSettings: GamePulseWidgetSettings = cloneDeep(
      this.settings,
    ) as GamePulseWidgetSettings;
    const group = this.getScope(scopeId, newSettings) || { triggers: [] };

    if (scopeId === 'global') {
      newSettings.global = {
        ...group,
        enabled,
      };
    } else {
      newSettings.games = {
        ...(newSettings.games || {}),
        [scopeId]: {
          ...group,
          enabled,
        },
      };
    }

    this._lastSavePromise = this.updateSettings(newSettings);
  }

  /** Enable all trigger groups at once. */
  public enableAllGroups() {
    const games = this.settings.games || {};
    const newGames: Record<string, GamePulseTriggerGroup> = {};

    Object.keys(games).forEach(gameId => {
      newGames[gameId] = {
        ...(games[gameId] || {}),
        triggers: games[gameId]?.triggers || [],
        enabled: true,
      };
    });

    const newSettings: GamePulseWidgetSettings = {
      ...this.settings,
      global: {
        ...(this.settings.global || {}),
        enabled: true,
      },
      games: newGames,
    };

    this._lastSavePromise = this.updateSettings(newSettings);
  }

  /** Disable all trigger groups at once. */
  public disableAllGroups() {
    const games = this.settings.games || {};
    const newGames: Record<string, GamePulseTriggerGroup> = {};

    Object.keys(games).forEach(gameId => {
      newGames[gameId] = {
        ...(games[gameId] || {}),
        triggers: games[gameId]?.triggers || [],
        enabled: false,
      };
    });

    const newSettings: GamePulseWidgetSettings = {
      ...this.settings,
      global: {
        ...(this.settings.global || {}),
        enabled: false,
      },
      games: newGames,
    };

    this._lastSavePromise = this.updateSettings(newSettings);
  }

  private async requestEndpoint(
    endpoint: typeof GAME_PULSE_API[keyof typeof GAME_PULSE_API],
    params?: { body?: any; headers?: any; query?: string },
  ) {
    const { path, method } = endpoint;
    const baseUrl = `https://${this.hostsService.streamlabs}/api/v5`;
    const queryString = params?.query ? `?${params.query}` : '';
    const url = `${baseUrl}/${path}${queryString}`;

    return this.widgetsService.request({
      url,
      method,
      body: params?.body,
      headers: params?.headers,
    });
  }

  @Bind()
  @Throttle(1000)
  public async testGamePulseTrigger(trigger: GamePulseTrigger) {
    if (!this.settings.is_muted) {
      /**
       * Ensure settings are muted before testing so that the user doesn't
       * get multiple/simultaneous audio alerts on the preview and main canvas
       */
      const newSettings = { ...this.settings, is_muted: true };
      this._lastSavePromise = this.updateSettings(newSettings);
    }
    try {
      if (this._lastSavePromise) {
        await this._lastSavePromise;
        // add a small buffer to ensure trigger changes have processed before testing
        await delay(750);
      }
    } catch (e) {
      console.warn('[GamePulseWidget] Pending save failed, proceeding with test anyway', e);
    }

    return this.requestEndpoint(GAME_PULSE_API.TestTrigger, {
      body: { ulid: trigger.id },
      headers: { 'X-Force-Test': 'true' },
    });
  }

  public async resetSettings() {
    await this.requestEndpoint(GAME_PULSE_API.ResetSettings);
  }

  public async deleteTrigger(triggerId: string, scopeId: string) {
    const res = await this.requestEndpoint(GAME_PULSE_API.DeleteTrigger, {
      query: `ulid=${triggerId}`,
    });
    if (!res.success) {
      throw new Error(`Failed to delete trigger: ${res.message}`);
    }

    const newSettings = cloneDeep(this.settings) as GamePulseWidgetSettings;
    if (scopeId === ScopeId.Global) {
      newSettings.global = newSettings.global || { enabled: true, triggers: [] };
      newSettings.global.triggers = (newSettings.global.triggers || []).filter(
        t => t.id !== triggerId,
      );
    } else {
      newSettings.games = newSettings.games || {};
      const group = newSettings.games[scopeId] as GamePulseTriggerGroup;
      if (group) {
        group.triggers = (group.triggers || []).filter(t => t.id !== triggerId);
      }
    }

    await this.replaceSettings(newSettings);

    // if the deleted trigger was selected, switch to General tab
    const { activeTabContext } = this;
    const { triggerId: selectedTriggerId, kind } = activeTabContext;
    if (kind === TabKind.TriggerDetail && selectedTriggerId === triggerId) {
      this.state.setSelectedTab(GamePulseTabUtils.ID_GENERAL);
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
  public async createTrigger({
    eventType,
    game,
    name,
    triggerType,
  }: {
    eventType: string;
    game: string;
    name: string;
    triggerType: TriggerType;
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
      this.state.setSelectedTab(GamePulseTabUtils.generateTriggerId(game, triggerId));
    }
  }

  /** Helper to append a new trigger to the correct group in settings. */
  private appendTriggerToSettings(
    settings: GamePulseWidgetSettings,
    scopeId: string,
    trigger: GamePulseTrigger,
  ): GamePulseWidgetSettings {
    const nextSettings = cloneDeep(settings) as GamePulseWidgetSettings;

    if (scopeId === ScopeId.Global) {
      const global = nextSettings.global || { enabled: true, triggers: [] };
      nextSettings.global = {
        ...global,
        triggers: [...(global.triggers || []), trigger],
      };
      return nextSettings;
    }

    const games = nextSettings.games || {};
    const group = (games[scopeId] as GamePulseTriggerGroup) || {
      enabled: true,
      triggers: [],
    };

    nextSettings.games = {
      ...games,
      [scopeId]: {
        ...group,
        triggers: [...(group.triggers || []), trigger],
      },
    };

    return nextSettings;
  }

  /** Helper to resolve a trigger group (global or game-specific) from settings. */
  private getScope(scopeId: string, settings = this.settings) {
    return scopeId === ScopeId.Global ? settings.global : settings.games?.[scopeId];
  }

  /** Get all triggers for a specific group. */
  public getTriggers(scopeId: string): GamePulseTrigger[] {
    const scope = this.getScope(scopeId);
    return scope?.triggers ?? [];
  }

  /** Get a specific trigger by ID within a group. Returns null if not found. */
  public getTrigger(scopeId: string, triggerId: string): GamePulseTrigger | null {
    const scope = this.getScope(scopeId);
    if (!scope) return null;
    return scope.triggers.find(t => t.id === triggerId) ?? null;
  }

  /** Override fetchData to include TTS voices */
  protected async fetchData() {
    const [data, voicesRes] = await Promise.all([
      super.fetchData(),
      this.requestEndpoint(GAME_PULSE_API.TTSLanguages),
    ]);

    try {
      if (voicesRes.success && this.state.staticConfig) {
        const currentConfig = cloneDeep(this.state.staticConfig) as GamePulseStaticConfig;
        if (!currentConfig.data.options) currentConfig.data.options = {} as any;
        currentConfig.data.options.tts_voices = voicesRes.data || voicesRes;
        this.state.setStaticConfig(currentConfig);
      }
    } catch (err) {
      console.error('[GamePulseWidget] Failed to merge voice data:', err);
    }
    data.showTutorial = true;
    return data;
  }

  /**
   * Initialize default settings for the GamePulse widget. For example, when a user first adds the widget
   * and has no triggers configured + the showTutorial flag is set, we want to populate some default triggers to help them get started.
   */
  public async initDefaults(
    gameEvents: string[] = ['elimination', 'victory', 'death', 'assist', 'knockout'],
  ) {
    try {
      const defaults = await this.requestEndpoint(GAME_PULSE_API.DefaultSettings, {
        body: { game_events: gameEvents },
      });
      if (defaults.settings || defaults.data?.settings) {
        const newSettings = defaults.settings || defaults.data?.settings;

        this.updateSettings(newSettings);
      }
    } catch (err) {
      console.error('[GamePulseWidget] Failed to create default settings', err);
    }
  }
}

export function useGamePulseWidget() {
  return useWidget<GamePulseModule>();
}
