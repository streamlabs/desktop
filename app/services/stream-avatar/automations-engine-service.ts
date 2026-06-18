import { InitAfter, Inject, Service } from 'services/core';
import { ScenesService } from 'services/scenes';
import { SourcesService } from 'services/sources';
import { StreamingService } from 'services/streaming';
import { WebsocketService } from 'services/websocket';
import { VisionService, VisionProcess } from 'services/vision';
import { AutomationsService } from './automations-service';
import { AgentSocketService } from './agent-socket-service';
import Utils from 'services/utils';
import { toUpper } from 'lodash';
import {
  ConditionsManager,
  GAME_NAMES,
  TCondition,
  TEvaluatedCondition,
} from './engine/conditions';
import { Actions, ActionContext } from './engine/actions';
import { GameState, defaultGameState } from './engine/game-state';

interface VisionEventItem {
  name: string;
  data: { value: number };
}

interface VisionEventPayload {
  events: VisionEventItem[];
  game: string;
}

@InitAfter('VisionService')
export class AutomationsEngineService extends Service {
  @Inject() private scenesService: ScenesService;
  @Inject() private sourcesService: SourcesService;
  @Inject() private streamingService: StreamingService;
  @Inject() private websocketService: WebsocketService;
  @Inject() private visionService: VisionService;
  @Inject() private automationsService: AutomationsService;
  @Inject() private agentSocketService: AgentSocketService;

  private gameState: GameState = { ...defaultGameState, pendingEvents: new Set() };
  private prevState: GameState = { ...defaultGameState, pendingEvents: new Set() };
  private activeProcess: VisionProcess | null = null;
  private selectedGame = 'fortnite';
  private automationPreviousConditionsMetCache = new Map<number, boolean>();
  private actionContext!: ActionContext;

  init() {
    // Engine runs only in the worker window to prevent double-firing.
    if (!Utils.isWorkerWindow()) return;

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
        this.agentSocketService.sendInstruction(instruction);
      },

      sendSimulationBark: (conditionType: string) => {
        this.agentSocketService.sendSimulationBark(conditionType);
      },
    };

    this.websocketService.socketEvent.subscribe(e => {
      if (e.type !== 'visionEvent') return;
      this.handleVisionEvent((e as any).message as VisionEventPayload);
    });

    this.visionService.onGame.subscribe(change => {
      this.activeProcess = change.activeProcess;
      this.selectedGame = change.selectedGame;
      this.resetGameState();
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

    const runPass = async (conditionsMet: boolean) => {
      for (const exportedAction of automation.actions) {
        try {
          const [action] = await Actions.fromExported([exportedAction as any], this.actionContext);
          await Actions.process({
            conditionsMet,
            conditions: automation.conditions as TCondition[],
            action: { ...action, props: { ...action.props, simulating: true } },
            context: this.actionContext,
            state: this.gameState,
            prevState: this.prevState,
          });
        } catch (error: unknown) {
          console.warn('[AutomationsEngine] simulate action failed', {
            action: exportedAction.type,
            error,
          });
        }
      }
    };

    await runPass(true);
    await new Promise(resolve => setTimeout(resolve, 5000));
    await runPass(false);
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
      switch (name) {
        case 'game_start':
        case 'round_start':
          next.eliminations = 0;
          next.teamScore = 0;
          next.opponentScore = 0;
          newEvents.push('game_start');
          break;

        case 'round_end':
        case 'game_end':
          Object.assign(next, defaultGameState);
          newEvents.push('game_end');
          break;

        case 'health':
          next.health = data.value;
          break;

        case 'shield':
          next.shield = data.value;
          break;

        case 'elimination':
          next.eliminations = (this.gameState.eliminations || 0) + 1;
          newEvents.push('elimination');
          break;

        case 'team_scored':
          next.teamScore = data.value;
          newEvents.push('team_scored');
          break;

        case 'opponent_scored':
          next.opponentScore = data.value;
          newEvents.push('opponent_scored');
          break;

        case 'low_health':
          next.health = 20;
          break;

        case 'full_health':
          next.health = 100;
          break;

        default:
          newEvents.push(name);
          break;
      }
    }

    this.gameState = { ...this.gameState, ...next, pendingEvents: new Set(newEvents) };

    if (newEvents.length > 0 || Object.keys(next).length > 0) {
      this.checkAndTriggerAutomations();
      queueMicrotask(() => {
        this.gameState = { ...this.gameState, pendingEvents: new Set() };
      });
    }
  }

  private async checkAndTriggerAutomations() {
    const automations = this.automationsService.state.automations.filter(a => a.enabled);
    const state = this.gameState;
    const prevState = this.prevState;
    const currentGame = this.getCurrentGame().toLowerCase();

    for (const automation of automations) {
      const conditionResults: TEvaluatedCondition[] = [];

      for (const condition of automation.conditions as TCondition[]) {
        const status = ConditionsManager.evaluate({ condition, state, prevState });
        const cachedStatus = this.automationPreviousConditionsMetCache.get(automation.id!);
        if (cachedStatus === status) continue;
        if (!condition.type.startsWith(currentGame)) continue;
        this.automationPreviousConditionsMetCache.set(automation.id!, status);
        conditionResults.push({ condition, status });
      }

      if (!conditionResults.length) continue;

      const conditionsNotMet = conditionResults.some(r => !r.status);

      for (const exportedAction of automation.actions) {
        try {
          const [action] = await Actions.fromExported([exportedAction as any], this.actionContext);
          await Actions.process({
            conditionsMet: !conditionsNotMet,
            conditions: conditionResults.map(r => r.condition),
            action,
            context: this.actionContext,
            state,
            prevState,
          });
        } catch (error: unknown) {
          console.warn('[AutomationsEngine] Action failed', { action: exportedAction.type, error });
        }
      }
    }
  }
}
