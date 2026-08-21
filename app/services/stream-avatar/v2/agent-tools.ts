import { Inject } from 'services/core/injector';
import { Service } from 'services/core/service';
import { ScenesService } from 'services/scenes';
import { SourcesService } from 'services/sources';
import { AudioService } from 'services/audio';
import { StreamingService } from 'services/streaming';
import { V2ToolOutcome } from './protocol';

/**
 * The tools the agent may execute on this machine.
 *
 * Hand-written rather than generated from the `platform-apps` `@apiMethod()`
 * decorators: that surface is a permission API for third-party apps, keyed by
 * resourceId and shaped for RPC. This one is ~10 curated actions with
 * LLM-facing descriptions and name-based addressing. Same underlying services,
 * different contract.
 *
 * Two conventions carried over from the automations engine:
 *  - scenes and sources are addressed **by name**, never by id — ids are not
 *    stable across scene collections, and names are what the model sees;
 *  - every handler returns something the agent can say out loud, so a refusal
 *    or a miss reads as an explanation rather than a silent no-op.
 *
 * Runs in the worker window, like everything else in the services layer.
 */
export class AgentToolsService extends Service {
  @Inject() private scenesService: ScenesService;
  @Inject() private sourcesService: SourcesService;
  @Inject() private audioService: AudioService;
  @Inject() private streamingService: StreamingService;

  private get handlers(): Record<string, (args: Record<string, unknown>) => Promise<unknown>> {
    return {
      scene_list: async () => ({
        activeScene: this.scenesService.views.activeScene?.name ?? null,
        scenes: this.scenesService.views.scenes.map(s => s.name),
      }),

      scene_switch: async args => {
        const name = String(args.scene ?? '');
        const scene = this.scenesService.views.scenes.find(s => s.name === name);
        if (!scene) {
          throw new Error(
            `No scene named "${name}". Available: ${this.scenesService.views.scenes
              .map(s => s.name)
              .join(', ')}`,
          );
        }
        this.scenesService.makeSceneActive(scene.id);
        return { switchedTo: scene.name };
      },

      source_list: async () => {
        const scene = this.scenesService.views.activeScene;
        if (!scene) return { scene: null, sources: [] };
        return {
          scene: scene.name,
          sources: scene.getItems().map(item => ({
            name: item.name,
            visible: item.visible,
            muted: this.audioService.views.getSource(item.sourceId)?.muted ?? false,
          })),
        };
      },

      source_set_visible: async args => {
        const name = String(args.source ?? '');
        const visible = args.visible !== false;
        const scene = this.scenesService.views.activeScene;
        const item = scene?.getItems().find(i => i.name === name);
        if (!item) throw new Error(`No source named "${name}" in the current scene.`);
        item.setVisibility(visible);
        return { source: name, visible };
      },

      source_set_muted: async args => {
        const name = String(args.source ?? '');
        const muted = args.muted !== false;
        const source = this.sourcesService.views.sources.find(s => s.name === name);
        if (!source) throw new Error(`No source named "${name}".`);
        const audioSource = this.audioService.views.getSource(source.sourceId);
        if (!audioSource) throw new Error(`"${name}" has no audio to mute.`);
        audioSource.setMuted(muted);
        return { source: name, muted };
      },

      stream_status: async () => ({
        streaming: this.streamingService.views.isStreaming,
        recording: this.streamingService.views.isRecording,
        replayBufferRunning: this.streamingService.views.isReplayBufferActive,
      }),

      stream_stop: async () => {
        if (!this.streamingService.views.isStreaming) {
          return { stopped: false, reason: 'not currently streaming' };
        }
        // stopStreaming() is deprecated in favour of toggleStreaming(); the
        // isStreaming guard above is what makes the toggle unambiguous.
        this.streamingService.actions.toggleStreaming();
        return { stopped: true };
      },

      replay_save: async () => {
        if (!this.streamingService.views.isReplayBufferActive) {
          throw new Error('The replay buffer is not running.');
        }
        this.streamingService.actions.saveReplay();
        return { saved: true };
      },
    };
  }

  canExecute(tool: string): boolean {
    return tool in this.handlers;
  }

  /**
   * Runs a tool, converting any throw into a tool error. The agent loop is
   * parked on this call's id, so it must always get an answer.
   */
  async execute(tool: string, args: Record<string, unknown>): Promise<V2ToolOutcome> {
    const handler = this.handlers[tool];
    if (!handler) {
      return { ok: false, code: 'unknown_tool', message: `Desktop cannot run ${tool}.` };
    }

    try {
      return { ok: true, result: await handler(args ?? {}) };
    } catch (e: unknown) {
      return {
        ok: false,
        code: 'failed',
        message: e instanceof Error ? e.message : `${tool} failed.`,
      };
    }
  }
}
