import { InitAfter, Inject, Service } from 'services/core';
import { ScenesService } from 'services/scenes';
import { SourcesService } from 'services/sources';
import { StreamingService } from 'services/streaming';
import type { IRecentEvent } from 'services/recent-events';
import { WebsocketService } from 'services/websocket';
import { VisionService, VisionProcess } from 'services/vision';
import { isVisionSupported } from 'services/vision/supported';
import { AutomationsService } from './automations-service';
import { StreamAvatarApiService } from './stream-avatar-api-service';
import { UsageStatisticsService } from 'services/usage-statistics';
import Utils from 'services/utils';
import { toUpper } from 'lodash';
import {
  ALERT_ROUTES,
  ConditionsManager,
  GAME_NAMES,
  isStreamEventKey,
  STREAM_ALERT_TYPES,
  TCondition,
} from './engine/conditions';
import { Actions, ActionContext } from './engine/actions';
import { GameState, StreamAlert, defaultGameState } from './engine/game-state';
import { setInstructions } from './engine/instructions';
import type { TAutomationExport } from './engine/automations';

interface VisionEventItem {
  name: string;
  data: { value: number };
}

interface VisionEventPayload {
  events: VisionEventItem[];
  game: string;
}

// Raw socket payload fields not covered by IRecentEvent, see the per-platform alert emitters.
type AlertItem = IRecentEvent & {
  event_id?: string;
  giftMembershipsCount?: number | string;
  giftMembershipsLevelName?: string;
  membershipLevel?: number | string;
  membershipLevelName?: string;
  level?: number | string;
  levelName?: string;
  jewelsAmount?: number | string;
  comboCount?: number | string;
  count?: number | string;
  redemption_name?: string;
  productType?: string;
  power_up_id?: string;
  giftName?: string;
  gift?: boolean;
};

interface AlertSocketEvent {
  type: string;
  for?: string;
  message: AlertItem[];
  event_id?: string;
}

const MAX_SEEN_ALERT_IDS = 100;

// Test-button sample type for conditions that match on the socket type itself.
const SAMPLE_TYPE_BY_KIND: Record<string, string> = {
  subtember: 'subtember',
  sub_extended: 'subExtension',
};

const optionalNumber = (v: unknown) => (v == null || isNaN(Number(v)) ? undefined : Number(v));

// Continuous state feeds, not moments — no condition listens for these, and
// they fire on every frame they change.
const STATE_ONLY_EVENTS = new Set(['health', 'shield', 'full_health']);

@InitAfter('VisionService')
export class AutomationsEngineService extends Service {
  @Inject() private scenesService: ScenesService;
  @Inject() private sourcesService: SourcesService;
  @Inject() private streamingService: StreamingService;
  @Inject() private websocketService: WebsocketService;
  @Inject() private visionService: VisionService;
  @Inject() private automationsService: AutomationsService;
  @Inject() private streamAvatarApiService: StreamAvatarApiService;
  @Inject() private usageStatisticsService: UsageStatisticsService;

  private gameState: GameState = { ...defaultGameState, pendingEvents: new Set() };
  private prevState: GameState = { ...defaultGameState, pendingEvents: new Set() };
  private activeProcess: VisionProcess | null = null;
  private selectedGame = 'fortnite';
  private automationPreviousConditionsMetCache = new Map<string, boolean>();
  private triggerChain: Promise<void> = Promise.resolve();
  private actionContext!: ActionContext;
  private largestDonationThisStream = 0;
  // Follow/sub counts this stream for the streak triggers, keyed `${platform}:${type}`. In memory
  // only; cleared on go-live.
  private streakCounts = new Map<string, number>();
  private seenAlertIds = new Set<string>();

  init() {
    // Engine runs only in the worker window to prevent double-firing.
    if (!Utils.isWorkerWindow()) return;
    if (!isVisionSupported()) return;

    this.streamAvatarApiService
      .getInstructions()
      .then(setInstructions)
      .catch(() => {});

    this.actionContext = {
      resolveSceneId: async ref => {
        const scenes = this.scenesService.views.scenes;
        const scene =
          'id' in ref ? scenes.find(s => s.id === ref.id) : scenes.find(s => s.name === ref.name);
        if (!scene) throw new Error(`Scene not found: ${JSON.stringify(ref)}`);
        return { id: scene.id, name: scene.name };
      },

      resolveSourceId: async ref => {
        const source =
          'id' in ref
            ? this.sourcesService.views.getSource(ref.id)
            : this.sourcesService.views.getSourcesByName(ref.name)[0];
        if (!source) throw new Error(`Source not found: ${JSON.stringify(ref)}`);
        return { id: source.sourceId, name: source.name };
      },

      switchScene: (id: string) => {
        this.scenesService.makeSceneActive(id);
      },

      setSourceVisible: (id: string, visible: boolean) => {
        const activeScene = this.scenesService.views.activeScene;
        if (!activeScene) return;
        for (const item of activeScene.getItems().filter(i => i.sourceId === id)) {
          item.setVisibility(visible);
        }
      },

      saveReplay: async () => {
        if (!this.streamingService.views.isReplayBufferActive) {
          this.streamingService.startReplayBuffer();
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        this.streamingService.saveReplay();
      },

      sendInstruction: (instruction: string) => {
        this.streamAvatarApiService.sendInstruction(instruction);
      },

      sendSimulationBark: (conditionType: string) => {
        this.streamAvatarApiService.sendSimulationBark(conditionType);
      },
    };

    this.websocketService.socketEvent.subscribe(e => {
      if (e.type === 'visionEvent') {
        this.handleVisionEvent((e as any).message as VisionEventPayload);
      } else if (STREAM_ALERT_TYPES.has(e.type)) {
        this.handleAlertEvent(e as any);
      }
    });

    // "Largest donation this stream" and the follow/sub streak counts start over once per broadcast.
    // The emitted state isn't a reliable session signal (dual output may never emit Live, and
    // adding an output mid-stream re-emits it), so reset on the aggregate offline -> streaming
    // edge instead. Reconnects and output changes stay "streaming" and keep the counters.
    let wasStreaming = this.streamingService.views.isStreaming;
    this.streamingService.streamingStatusChange.subscribe(() => {
      const isStreaming = this.streamingService.views.isStreaming;
      if (isStreaming && !wasStreaming) {
        this.largestDonationThisStream = 0;
        this.streakCounts.clear();
      }
      wasStreaming = isStreaming;
    });

    this.visionService.onGame.subscribe(change => {
      this.activeProcess = change.activeProcess;
      this.selectedGame = change.selectedGame;
      this.resetGameState();
    });

    // Reset scene-limited automations' cached status so the first match after
    // re-entering their scene can fire.
    this.scenesService.sceneSwitched.subscribe(() => {
      this.automationsService.state.automations
        .filter(a => a.scenes?.length)
        .forEach(a => {
          for (const key of this.automationPreviousConditionsMetCache.keys()) {
            if (key.startsWith(`${a.id}:`)) this.automationPreviousConditionsMetCache.delete(key);
          }
        });
    });
  }

  /**
   * Runs an automation's actions on demand so the user can test it from the
   * list. Fires every action as if its conditions were met, waits, then fires
   * again with conditions unmet so conditional show/hide actions revert.
   */
  async simulateAutomation(id: number): Promise<void> {
    const automation = this.automationsService.state.automations.find(a => a.id === id);
    if (!automation) {
      console.warn('[AutomationsEngine] simulateAutomation: automation not found', id);
      return;
    }

    // ponytail: only the first trigger is simulated; loop all if users ask
    const allConditions = (automation.conditions as TCondition[]).slice(0, 1);

    // Stream alerts have no CDN voice lines and are pulses (nothing to revert):
    // run the actions once, for real, against a sample alert.
    if (allConditions[0] && isStreamEventKey(allConditions[0].type)) {
      const alert = this.sampleAlert(allConditions[0]);
      if (!alert) return;
      await this.runActions(
        automation.actions,
        allConditions,
        true,
        { ...this.gameState, alert },
        this.prevState,
      );
      return;
    }

    const runPass = (conditionsMet: boolean) =>
      this.runActions(
        automation.actions,
        allConditions,
        conditionsMet,
        this.gameState,
        this.prevState,
        true,
      );

    await runPass(true);
    await new Promise(resolve => setTimeout(resolve, 5000));
    await runPass(false);
  }

  private async runActions(
    actions: TAutomationExport['actions'],
    conditions: TCondition[],
    conditionsMet: boolean,
    state: GameState,
    prevState: GameState,
    simulating = false,
  ) {
    for (const exportedAction of actions) {
      try {
        const [action] = await Actions.fromExported([exportedAction as any], this.actionContext);
        await Actions.process({
          conditionsMet,
          conditions,
          action: simulating ? { ...action, props: { ...action.props, simulating } } : action,
          context: this.actionContext,
          state,
          prevState,
        });
      } catch (error: unknown) {
        console.warn('[AutomationsEngine] Action failed', { action: exportedAction.type, error });
      }
    }
  }

  /** An alert that satisfies `condition`, for the Test button. */
  private sampleAlert(condition: TCondition): StreamAlert | undefined {
    const route = ALERT_ROUTES[condition.type];
    if (!route) {
      console.warn('[AutomationsEngine] sampleAlert: no alert route for', condition.type);
      return;
    }
    const { condition: kind, value } = (condition.props ?? {}) as {
      condition?: string;
      value?: number | string;
    };
    const text = typeof value === 'string' ? value : undefined;
    const n = typeof value === 'number' ? value : 5;
    let subPlan = '1000';
    if (kind === 'prime') subPlan = 'prime';
    else if (kind === 'tier') subPlan = String(n * 1000);
    let gifter: string | undefined;
    if (kind === 'gift') gifter = 'TestGifter';
    else if (kind === 'anon_gift' || kind === 'min_anon_amount') gifter = 'Anonymous';
    return {
      type: SAMPLE_TYPE_BY_KIND[kind] ?? route.types[0],
      platform: route.platforms[0],
      name: 'TestViewer',
      amount: n,
      months: n,
      streakMonths: n,
      subPlan,
      subType: kind === 'prime_upgrade' ? 'primepaidupgrade' : undefined,
      gifter,
      raiders: n,
      recurring: kind === 'recurring',
      level: n,
      combo: n,
      // A text condition's value is whichever field it matches on.
      levelName: text,
      product: text,
      productType: text,
      giftType: text,
      powerUpId: text,
      giftName: text,
      gift: kind === 'gift_redeemed',
      previousLargestDonation: 0,
      // Lands the Test button on an "every N" streak.
      streakCount: Number(value) || 5,
    };
  }

  private resetGameState() {
    this.gameState = { ...defaultGameState, pendingEvents: new Set() };
    this.prevState = { ...defaultGameState, pendingEvents: new Set() };
    this.automationPreviousConditionsMetCache.clear();
  }

  private getCurrentGame(): string {
    const process = this.activeProcess;
    if (!process) return 'STREAMLABS';

    if (process.type === 'capture_device' || process.executable_name === 'vlc.exe') {
      return this.visionService.state.availableGames[this.selectedGame]
        ? toUpper(this.selectedGame)
        : 'STREAMLABS';
    }

    return this.visionService.state.availableGames[process.game]
      ? toUpper(process.game)
      : 'STREAMLABS';
  }

  private handleVisionEvent(payload: VisionEventPayload) {
    if (!(payload.game in GAME_NAMES)) return;

    this.prevState = { ...this.gameState, pendingEvents: new Set(this.gameState.pendingEvents) };

    const newEvents: string[] = [];
    const next: Partial<GameState> = {};

    for (const { name, data } of payload.events) {
      // 1. Fold the event into game state.
      switch (name) {
        case 'game_start':
        case 'round_start':
          next.eliminations = 0;
          next.teamScore = 0;
          next.opponentScore = 0;
          break;

        case 'round_end':
        case 'game_end':
          Object.assign(next, defaultGameState);
          break;

        case 'health':
          next.health = data.value;
          break;

        case 'shield':
          next.shield = data.value;
          break;

        case 'elimination':
          next.eliminations = (this.gameState.eliminations || 0) + 1;
          break;

        case 'team_scored':
          next.teamScore = data.value;
          break;

        case 'opponent_scored':
          next.opponentScore = data.value;
          break;

        case 'low_health':
          next.health = 20;
          break;

        case 'full_health':
          next.health = 100;
          break;
      }

      // 2. Forward the raw name so `onEvent(name)` conditions can match it.
      if (!STATE_ONLY_EVENTS.has(name)) newEvents.push(name);
    }

    this.gameState = { ...this.gameState, ...next, pendingEvents: new Set(newEvents) };

    if (newEvents.length > 0 || Object.keys(next).length > 0) {
      const state = this.gameState;
      const prevState = this.prevState;

      this.triggerChain = this.triggerChain.then(() =>
        this.checkAndTriggerAutomations(state, prevState).catch(error => {
          console.warn('[AutomationsEngine] Trigger pass failed', error);
        }),
      );
      queueMicrotask(() => {
        this.gameState = { ...this.gameState, pendingEvents: new Set() };
      });
    }
  }

  private handleAlertEvent(e: AlertSocketEvent) {
    if (!Array.isArray(e.message)) return;

    // Counters below still update, so streaks stay right if an automation is added mid-stream.
    const hasStreamEventAutomation = this.automationsService.state.automations.some(
      a => a.enabled && (a.conditions as TCondition[]).some(c => isStreamEventKey(c.type)),
    );

    for (const [i, item] of e.message.entries()) {
      // isTest is kept on purpose so the dashboard's Test Alert works.
      if (item.isPreview || item.repeat) continue;

      // The envelope id is shared by every item in the message, so index it.
      const id = item._id ?? item.event_id ?? (e.event_id && `${e.event_id}:${i}`);
      if (id) {
        if (this.seenAlertIds.has(id)) continue;
        this.seenAlertIds.add(id);
        if (this.seenAlertIds.size > MAX_SEEN_ALERT_IDS) {
          this.seenAlertIds.delete(this.seenAlertIds.values().next().value);
        }
      }

      let amount: number;
      switch (e.type) {
        case 'superchat':
        case 'superSticker':
          // ponytail: amount is in micros per twitchalerts superchat.alert.js; verify against a live
          // payload. The Alert Box also converts currency, we don't.
          amount = Number(item.amount) / 1_000_000;
          break;
        case 'membershipGift':
          amount = Number(item.giftMembershipsCount ?? item.amount);
          break;
        case 'jewelGift':
          amount = Number(item.jewelsAmount);
          break;
        case 'supportGifter':
          amount = Number(item.count);
          break;
        default:
          amount = Number(item.amount);
      }

      const alert: StreamAlert = {
        type: e.type,
        platform: (e.for || 'streamlabs').replace(/_account$/, ''),
        name:
          item.display_name ||
          item.name ||
          item.from ||
          item.redeemer_display_name ||
          item.gifter ||
          '',
        amount: amount || 0,
        months: Number(item.months) || 0,
        streakMonths: Number(item.streak_months) || 0,
        subPlan: String(item.sub_plan ?? '').toLowerCase(),
        subType: item.sub_type,
        gifter: item.gifter || undefined,
        raiders: Number(item.raiders ?? item.viewers) || 0,
        recurring: item.recurring_donation != null,
        level: optionalNumber(item.membershipLevel ?? item.level),
        levelName: item.membershipLevelName ?? item.giftMembershipsLevelName ?? item.levelName,
        product: item.product ?? item.redemption_name,
        productType: item.productType,
        giftType: item.giftType,
        powerUpId: item.power_up_id,
        powerUpName: item.power_up_name,
        giftName: item.giftName,
        combo: optionalNumber(item.comboCount),
        gift: !!item.gift,
        previousLargestDonation: this.largestDonationThisStream,
        streakCount: 0,
      };

      // Counted per platform and type, here rather than after the pass, so back-to-back follows
      // each see their own count. Test alerts never count, so they can't hit a streak. Gift bombs
      // arrive as one `subscription` each; subMysteryGift, subtember and subExtension don't count.
      if ((alert.type === 'follow' || alert.type === 'subscription') && !item.isTest) {
        const key = `${alert.platform}:${alert.type}`;
        alert.streakCount = (this.streakCounts.get(key) ?? 0) + 1;
        this.streakCounts.set(key, alert.streakCount);
      }

      // Bumped now, not after the pass: the alert above already captured the previous
      // value, and back-to-back donations must each see the one before them. Test
      // alerts don't count, or a fake $100 would poison largest_of_stream.
      if (alert.type === 'donation' && !item.isTest) {
        this.largestDonationThisStream = Math.max(this.largestDonationThisStream, alert.amount);
      }

      if (!hasStreamEventAutomation) continue;

      const { gameState, prevState } = this;
      this.triggerChain = this.triggerChain.then(() =>
        this.checkAndTriggerAutomations(gameState, prevState, alert).catch(error => {
          console.warn('[AutomationsEngine] Alert trigger pass failed', error);
        }),
      );
    }
  }

  private async checkAndTriggerAutomations(
    state: GameState,
    prevState: GameState,
    alert?: StreamAlert,
  ) {
    const automations = this.automationsService.state.automations.filter(a => a.enabled);
    const currentGame = this.getCurrentGame().toLowerCase();
    const evalState = alert ? { ...state, alert } : state;

    for (const automation of automations) {
      if (automation.scenes?.length) {
        const activeSceneName = this.scenesService.views.activeScene?.name;
        if (!activeSceneName || !automation.scenes.includes(activeSceneName)) continue;
      }

      // With no game running getCurrentGame() is 'STREAMLABS', which would otherwise
      // pull the stream-event alert conditions into game passes.
      const results = (automation.conditions as TCondition[])
        .map((condition, index) => ({ condition, index }))
        .filter(({ condition: c }) =>
          alert
            ? isStreamEventKey(c.type)
            : c.type.startsWith(currentGame) && !isStreamEventKey(c.type),
        )
        .map(({ condition, index }) => ({
          condition,
          index,
          status: ConditionsManager.evaluate({ condition, state: evalState, prevState }),
        }));
      if (!results.length) continue;

      // Triggers are ORed: `fired` is what the actions run for.
      let fired: TCondition[];
      let conditionsMet = true;

      if (alert) {
        // Alerts are pulses: fire on a match, never fire the "unmet" pass, and skip
        // the edge cache so back-to-back alerts both fire.
        fired = results.filter(r => r.status).map(r => r.condition);
        if (!fired.length) continue;
      } else {
        const cache = this.automationPreviousConditionsMetCache;
        const anyKey = `${automation.id}:any`;
        const prevAny = cache.get(anyKey);
        const anyNow = results.some(r => r.status);
        // Key includes the type so an edited/reordered trigger list never reads a stale entry.
        const edgeKey = (r: { index: number; condition: TCondition }) =>
          `${automation.id}:${r.index}:${r.condition.type}`;
        const newlyMet = results.filter(r => r.status && cache.get(edgeKey(r)) !== true);
        results.forEach(r => cache.set(edgeKey(r), r.status));
        cache.set(anyKey, anyNow);

        if (newlyMet.length) {
          fired = newlyMet.map(r => r.condition);
        } else if (!anyNow && prevAny !== false) {
          // Nothing met any more (or first sight while unmet): the "unmet" pass, same as the
          // old single-trigger "changed" check.
          fired = results.map(r => r.condition);
          conditionsMet = false;
        } else {
          continue;
        }
      }

      this.usageStatisticsService.recordAnalyticsEvent('Automations', {
        action: 'automation_fired',
        game: alert ? fired[0].type.split('.')[0] : currentGame,
        trigger: fired[0].type,
        actions: automation.actions.map(a => a.type),
      });

      await this.runActions(automation.actions, fired, conditionsMet, evalState, prevState);
    }
  }
}
