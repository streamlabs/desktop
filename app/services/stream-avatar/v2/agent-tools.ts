import { Inject } from 'services/core/injector';
import { Service } from 'services/core/service';
import { ScenesService } from 'services/scenes';
import { SourcesService } from 'services/sources';
import { AudioService } from 'services/audio';
import { StreamingService } from 'services/streaming';
import {
  SourceFiltersService,
  EFilterDisplayType,
  TSourceFilterType,
} from 'services/source-filters';
import { TObsValue } from 'components/obs/inputs/ObsInput';
import { PerformanceService } from 'services/performance';
import { DiagnosticsService } from 'services/diagnostics';
import { VideoSettingsService } from 'services/settings-v2/video';
import { V2ToolOutcome } from './protocol';

/**
 * Every filter this service adds is named with this prefix.
 *
 * It is how a previous preset is found and cleared before the next goes on.
 * Matching the prefix rather than the chosen preset's own filters matters:
 * switching from `too_quiet` to `background_noise` must not leave the limiter
 * behind, stacked underneath the new chain.
 */
const FILTER_PREFIX = 'Sidekick ';

interface MicFilter {
  name: string;
  type: TSourceFilterType;
  settings: Dictionary<TObsValue>;
}

/**
 * Mic filter chains, chosen by what the streamer says is wrong.
 *
 * One chain for everybody did not work: the same gate that suits a decent mic in
 * a quiet room sits below a noisy room's floor and does nothing, and compressing
 * someone who is simply too quiet without makeup gain leaves them quieter still.
 *
 * These are still fixed numbers — a starting point the streamer can tune in the
 * Filters dialog, not a measurement of their actual mic. Fitting a specific mic
 * means sampling its real noise floor, which is a bigger piece of work; see the
 * note in the plan if these turn out to miss often.
 *
 * Order within a chain is application order, which is signal order in OBS.
 */
const MIC_PRESETS: Record<string, MicFilter[]> = {
  // Nothing specific said. The balanced chain.
  general: [
    {
      name: `${FILTER_PREFIX}Noise Suppression`,
      type: 'noise_suppress_filter_v2',
      settings: { method: 'rnnoise' },
    },
    {
      name: `${FILTER_PREFIX}Noise Gate`,
      type: 'noise_gate_filter',
      settings: { open_threshold: -26, close_threshold: -32 },
    },
    {
      name: `${FILTER_PREFIX}Compressor`,
      type: 'compressor_filter',
      settings: { ratio: 4, threshold: -18 },
    },
  ],

  // Fan, keyboard, air conditioning, room tone. RNNoise does the real work and
  // needs no threshold; the gate is kept moderate rather than aggressive so it
  // cannot eat the front of a quietly spoken word. No compressor on purpose —
  // compressing a noisy signal lifts the room tone between words.
  background_noise: [
    {
      name: `${FILTER_PREFIX}Noise Suppression`,
      type: 'noise_suppress_filter_v2',
      settings: { method: 'rnnoise' },
    },
    {
      name: `${FILTER_PREFIX}Noise Gate`,
      type: 'noise_gate_filter',
      settings: { open_threshold: -30, close_threshold: -36 },
    },
  ],

  // Makeup gain is the actual fix. OBS has no standalone gain filter in
  // TSourceFilterType, so it rides on the compressor's output_gain, with a
  // limiter so that gain cannot clip. No gate: they have told us level is the
  // problem, and a gate is the one filter that can make quiet speech vanish.
  too_quiet: [
    {
      name: `${FILTER_PREFIX}Compressor`,
      type: 'compressor_filter',
      settings: { ratio: 3, threshold: -24, output_gain: 12 },
    },
    { name: `${FILTER_PREFIX}Limiter`, type: 'limiter_filter', settings: { threshold: -3 } },
  ],

  // Peaks and troughs, or clipping on the loud moments.
  uneven_volume: [
    {
      name: `${FILTER_PREFIX}Compressor`,
      type: 'compressor_filter',
      settings: { ratio: 4, threshold: -18, output_gain: 4 },
    },
    { name: `${FILTER_PREFIX}Limiter`, type: 'limiter_filter', settings: { threshold: -2 } },
  ],
};

/** The ticket form Settings > Get Support links to (`Support.tsx`). */
const SUPPORT_TICKET_URL =
  'https://support.streamlabs.com/hc/en-us/requests/new?ticket_form_id=473667';

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
  @Inject() private sourceFiltersService: SourceFiltersService;
  @Inject() private performanceService: PerformanceService;
  @Inject() private diagnosticsService: DiagnosticsService;
  @Inject() private videoSettingsService: VideoSettingsService;

  /**
   * The microphone, resolved rather than asked for.
   *
   * "Make my mic sound better" must not depend on the model guessing the exact
   * name out of source_list. `Mic/Aux` is the app's own default name for it
   * (scene-collections seeds it), with a "Microphone…" prefix match as the
   * fallback for anyone who renamed theirs — the same lookup the plugin's
   * audio_set_muted uses.
   */
  private findMicSource() {
    const audioSources = this.audioService.views.sourcesForCurrentScene;
    return (
      audioSources.find(s => s.name === 'Mic/Aux') ??
      audioSources.find(s => s.name.toLowerCase().startsWith('mic'))
    );
  }

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

      mic_enhance: async args => {
        const problem = String(args.problem ?? 'general');

        // No OBS filter fixes room reverb or speaker bleed, so say that rather
        // than applying something that will not help. Checked before the mic
        // lookup: the advice holds whether or not a mic source exists.
        if (problem === 'echo') {
          return {
            applied: false,
            reason:
              'Echo is a room and monitoring problem, not something an audio filter can remove. The fixes are ' +
              'listening on headphones instead of speakers, moving the mic closer and pointing it away from the room, ' +
              'and putting something soft on the hard surfaces around it.',
          };
        }

        const mic = this.findMicSource();
        if (!mic) {
          throw new Error(
            'No microphone source found. The streamer needs to add a Mic/Aux source before this can do anything.',
          );
        }

        // Always clear ours first, by prefix rather than by the chosen preset:
        // switching presets must not leave the previous one's filters stacked
        // underneath, and asking twice must not end up with two gates fighting.
        const existing = this.sourceFiltersService.views.filtersBySourceId(mic.sourceId, true);
        const removed = existing
          .filter(f => f.name.startsWith(FILTER_PREFIX))
          .map(f => {
            this.sourceFiltersService.remove(mic.sourceId, f.name);
            return f.name;
          });

        if (problem === 'none') {
          return { source: mic.name, problem, applied: false, filters: [], removed };
        }

        const preset = MIC_PRESETS[problem] ?? MIC_PRESETS.general;
        for (const filter of preset) {
          this.sourceFiltersService.add(
            mic.sourceId,
            filter.type,
            filter.name,
            { ...filter.settings },
            EFilterDisplayType.Normal,
          );
        }

        return {
          source: mic.name,
          problem,
          applied: true,
          filters: preset.map(f => f.name),
          removed,
        };
      },

      stream_health: async () => {
        const { state } = this.performanceService;
        const base = this.videoSettingsService.baseResolution;
        const output = this.videoSettingsService.outputResolutions.horizontal;

        return {
          // The service's own verdict. Lead with it rather than re-deriving one
          // from the percentages — the thresholds live in one place for a reason.
          streamQuality: this.performanceService.views.streamQuality,
          cpuPercent: state.CPU,
          frameRate: state.frameRate,
          droppedFrames: state.numberDroppedFrames,
          droppedFramesPercent: state.percentageDroppedFrames,
          skippedFrames: state.numberSkippedFrames,
          skippedFramesPercent: state.percentageSkippedFrames,
          laggedFrames: state.numberLaggedFrames,
          laggedFramesPercent: state.percentageLaggedFrames,
          streamingBandwidthKbps: state.streamingBandwidth,
          baseResolution: `${base.baseWidth}x${base.baseHeight}`,
          outputResolution: `${output.outputWidth}x${output.outputHeight}`,
          streaming: this.streamingService.views.isStreaming,
          recording: this.streamingService.views.isRecording,
        };
      },

      diagnostics_report: async () => {
        const report = await this.diagnosticsService.uploadReport();
        if (!report?.report_code) {
          throw new Error(
            'The diagnostic report did not upload. Ask them to try again in a moment.',
          );
        }
        return { reportCode: report.report_code };
      },

      support_open_ticket: async () => {
        // @electron/remote, the way application-menu.ts opens external links.
        require('@electron/remote').shell.openExternal(SUPPORT_TICKET_URL);
        return { opened: true, url: SUPPORT_TICKET_URL };
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
