import { TwitchService } from 'services/platforms/twitch';
import { IYoutubeAutoOptimizerProbeLease, YoutubeService } from 'services/platforms/youtube';
import {
  isEligibleAutoOptimizerDualOutputActiveStreamSetup,
  isEligibleAutoOptimizerEnhancedBroadcastingDualOutputStreamSetup,
} from './probe-policy';
import { IAutoOptimizerRun } from './native-run';
import { IAutoOptimizerActiveProbe, IAutoOptimizerStreamSetup } from './types';

const YOUTUBE_INGEST_CONFIRMATION_TIMEOUT_MS = 12000;

function probeCoverage(expected: number, available: number) {
  if (available <= 0) {
    return { measurement: 'estimated' as const, estimateReason: 'probe_disabled' as const };
  }
  if (available < expected) {
    return {
      measurement: 'active' as const,
      estimateReason: 'partial_provider_probes' as const,
    };
  }
  return { measurement: 'active' as const, estimateReason: undefined };
}

type TTwitchProbeService = Pick<TwitchService, 'fetchStreamKey'>;
type TYoutubeProbeService = Pick<
  YoutubeService,
  'acquireAutoOptimizerProbe' | 'waitForAutoOptimizerProbeActive' | 'releaseAutoOptimizerProbe'
>;

export interface IPreparedAutoOptimizerProbes {
  streamSetup: IAutoOptimizerStreamSetup;
  probesByOutput: ReadonlyMap<string, IAutoOptimizerActiveProbe[]>;
}

/**
 * A requested platform bandwidth probe could not be prepared. The error is retryable
 * because credentials, platform APIs, or the required OBS canvas may become
 * available later.
 */
export class AutoOptimizerProbeSetupError extends Error {
  readonly code = 'active_probe_setup_failed';
  readonly retryable = true;

  constructor() {
    super("We couldn't prepare the bandwidth test. Try again, or continue without optimization.");
    this.name = 'AutoOptimizerProbeSetupError';
  }
}

/**
 * Keeps platform credentials and temporary YouTube resources for one optimizer
 * run. Cleanup must stop and close OSN output before deleting the YouTube
 * resources.
 */
export class AutoOptimizerProbeResources {
  private readonly credentialProbes: IAutoOptimizerActiveProbe[] = [];
  private readonly youtubeLeases = new Map<string, IYoutubeAutoOptimizerProbeLease>();
  private readonly confirmations = new Map<string, Promise<void>>();
  private abortController: AbortController | null = null;
  private cleanupPromise: Promise<void> | null = null;

  constructor(
    private readonly twitch: TTwitchProbeService,
    private readonly youtube: TYoutubeProbeService,
  ) {}

  async prepare(
    sourceStreamSetup: IAutoOptimizerStreamSetup,
  ): Promise<IPreparedAutoOptimizerProbes> {
    this.abortController?.abort();
    const controller = new AbortController();
    this.abortController = controller;
    const streamSetup: IAutoOptimizerStreamSetup = {
      ...sourceStreamSetup,
      outputs: sourceStreamSetup.outputs.map(output => ({
        ...output,
        destinations: output.destinations.map(destination => ({ ...destination })),
        probeCandidates: output.probeCandidates.map(candidate => ({ ...candidate })),
      })),
    };
    const activeDualOutput = isEligibleAutoOptimizerDualOutputActiveStreamSetup(streamSetup);
    const activeEnhancedBroadcastingDualOutput = isEligibleAutoOptimizerEnhancedBroadcastingDualOutputStreamSetup(
      streamSetup,
    );
    const requestedProbeCount = streamSetup.outputs.reduce(
      (count, output) => count + output.probeCandidates.length,
      0,
    );
    const probesByOutput = new Map<string, IAutoOptimizerActiveProbe[]>();

    try {
      for (const output of streamSetup.outputs) {
        const expectedProbeCount = output.probeCandidates.length;
        const alreadyPartial = output.estimateReason === 'partial_provider_probes';
        const acquired: Array<{
          candidate: typeof output.probeCandidates[number];
          probe: IAutoOptimizerActiveProbe;
        }> = [];

        for (const candidate of output.probeCandidates) {
          try {
            if (
              candidate.kind === 'twitch-standard' ||
              candidate.kind === 'twitch-enhanced-broadcasting'
            ) {
              const streamKey = await this.twitch.fetchStreamKey();
              if (!streamKey) throw new Error('Twitch did not return a stream key');
              const probe: IAutoOptimizerActiveProbe =
                candidate.kind === 'twitch-standard'
                  ? {
                      id: candidate.probeId,
                      kind: candidate.kind,
                      server: 'auto',
                      streamKey,
                    }
                  : {
                      id: candidate.probeId,
                      kind: candidate.kind,
                      streamKey,
                    };
              this.credentialProbes.push(probe);
              acquired.push({ candidate, probe });
            } else {
              const lease = await this.youtube.acquireAutoOptimizerProbe({
                signal: controller.signal,
              });
              const probe: IAutoOptimizerActiveProbe = {
                id: lease.probeId,
                kind: candidate.kind,
                server: lease.server,
                streamKey: lease.streamKey,
              };
              // After copying credentials into the OSN request object, retain
              // only identifiers for cleanup and crash recovery.
              lease.server = '';
              lease.streamKey = '';
              this.youtubeLeases.set(lease.probeId, lease);
              this.credentialProbes.push(probe);
              acquired.push({
                candidate: { ...candidate, probeId: lease.probeId },
                probe,
              });
            }
          } catch (error: unknown) {
            if ((error as { name?: string } | null)?.name === 'AbortError') throw error;
            console.warn(
              `[Auto Optimizer] ${candidate.platform} bandwidth probe unavailable; using estimate`,
            );
          }
        }

        output.probeCandidates = acquired.map(({ candidate }) => candidate);
        if (expectedProbeCount > 0) {
          const coverage = probeCoverage(expectedProbeCount, acquired.length);
          output.measurement = coverage.measurement;
          output.estimateReason =
            coverage.measurement === 'active' && alreadyPartial
              ? 'partial_provider_probes'
              : coverage.estimateReason;
        }
        if (acquired.length) {
          probesByOutput.set(
            output.outputId,
            acquired.map(({ probe }) => probe),
          );
        }
      }

      const activeProbes = [...probesByOutput.values()].flat();
      if (activeDualOutput && activeProbes.length !== requestedProbeCount) {
        throw new AutoOptimizerProbeSetupError();
      }
      if (
        activeEnhancedBroadcastingDualOutput &&
        !activeProbes.some(probe => probe.kind === 'twitch-enhanced-broadcasting')
      ) {
        throw new AutoOptimizerProbeSetupError();
      }
      if (requestedProbeCount > 0 && activeProbes.length === 0) {
        throw new AutoOptimizerProbeSetupError();
      }

      return { streamSetup, probesByOutput };
    } catch (error: unknown) {
      this.redactCredentials();
      await this.releaseYoutubeLeases();
      throw error;
    }
  }

  redactCredentials(): void {
    this.credentialProbes.forEach(probe => {
      probe.streamKey = '';
      if ('server' in probe) probe.server = '';
    });
    this.credentialProbes.length = 0;
    this.youtubeLeases.forEach(lease => {
      lease.streamKey = '';
      lease.server = '';
    });
  }

  confirmYoutubeIngest(
    probeId: string,
    getRun: () => IAutoOptimizerRun | null,
    isCurrentAttempt: () => boolean,
  ): void {
    if (this.confirmations.has(probeId)) return;

    const lease = this.youtubeLeases.get(probeId);
    const controller = this.abortController;
    const confirmation = (async () => {
      let received = false;
      if (lease && controller && !controller.signal.aborted) {
        try {
          received = await this.youtube.waitForAutoOptimizerProbeActive(lease, {
            signal: controller.signal,
            timeoutMs: YOUTUBE_INGEST_CONFIRMATION_TIMEOUT_MS,
          });
        } catch (error: unknown) {
          if ((error as { name?: string } | null)?.name === 'AbortError') return;
          console.warn('[Auto Optimizer] YouTube ingest confirmation failed', error);
        }
      }

      const run = getRun();
      if (!isCurrentAttempt() || controller?.signal.aborted || !run) return;
      try {
        run.confirmProbeIngest(probeId, received);
      } catch (error: unknown) {
        console.warn('[Auto Optimizer] Could not confirm YouTube probe ingest', error);
      }
    })();
    this.confirmations.set(probeId, confirmation);
  }

  /**
   * Stop platform API polling, wait for OSN output to stop and close, then delete
   * temporary YouTube resources. If OSN cleanup fails, retain the leases for
   * retry.
   */
  async cleanupAfterNativeClose(closeNative: () => Promise<void>): Promise<void> {
    if (this.cleanupPromise) return this.cleanupPromise;
    const cleanup = this.performCleanup(closeNative);
    this.cleanupPromise = cleanup;
    try {
      await cleanup;
    } finally {
      if (this.cleanupPromise === cleanup) this.cleanupPromise = null;
    }
  }

  private async performCleanup(closeNative: () => Promise<void>): Promise<void> {
    this.abortController?.abort();
    this.abortController = null;
    this.redactCredentials();

    await closeNative();

    const confirmations = [...this.confirmations.values()];
    if (confirmations.length) await Promise.allSettled(confirmations);
    this.confirmations.clear();
    await this.releaseYoutubeLeases();
  }

  private async releaseYoutubeLeases(): Promise<void> {
    for (const [probeId, lease] of [...this.youtubeLeases]) {
      try {
        await this.youtube.releaseAutoOptimizerProbe(lease);
        this.youtubeLeases.delete(probeId);
      } catch (error: unknown) {
        // OSN output is already stopped, so deletion can be retried later.
        // Retain the identifier-only lease and crash-recovery journal.
        console.warn('[Auto Optimizer] Deferred YouTube probe cleanup', error);
      }
    }
  }
}
