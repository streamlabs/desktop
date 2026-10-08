import { mutation, Inject, InitAfter, Service, PersistentStatefulService } from 'services/core';
import path from 'path';
import Vue from 'vue';
import fs from 'fs-extra';
import * as remote from '@electron/remote';
import { EStreamingState, StreamingService } from 'services/streaming';
import { getPlatformService } from 'services/platforms';
import { UserService } from 'services/user';
import {
  IYoutubeVideoUploadOptions,
  IYoutubeUploadResponse,
} from 'services/platforms/youtube/uploader';
import { YoutubeService } from 'services/platforms/youtube';
import os from 'os';
import {
  SCRUB_SPRITE_DIRECTORY,
  SUPPORTED_FILE_TYPES,
  REPLAY_SETUP_URL_STAGING,
  REPLAY_SETUP_URL_PRODUCTION,
  REPLAY_PROTOCOL,
  HIGHLIGHTER_PROTOCOL,
  REPLAY_SETUP_EXE_NAME,
  REPLAY_INSTALL_ORIGIN,
  REPLAY_INSTALL_ORIGIN_DIR_NAME,
  REPLAY_INSTALL_ORIGIN_FILE_NAME,
} from './constants';
import { pmap } from 'util/pmap';
import { RenderingClip } from './rendering/rendering-clip';
import { throttle } from 'lodash-decorators';
import * as Sentry from '@sentry/browser';
import { TAnalyticsEvent, UsageStatisticsService } from 'services/usage-statistics';

import { $t } from 'services/i18n';
import { DismissablesService, EDismissable } from 'services/dismissables';
import { ENotificationType, NotificationsService } from 'services/notifications';
import { JsonrpcService } from 'services/api/jsonrpc';
import { NavigationService } from 'services/navigation';
import { SharedStorageService } from 'services/integrations/shared-storage';
import uuid from 'uuid';
import { IDownloadProgress, downloadFile } from 'util/requests';
import {
  EUploadPlatform,
  IHighlighterState,
  IStreamInfoForAiHighlighter,
  IUploadInfo,
  TClip,
  ITempRecordingInfo,
  IReplayInstallState,
  IReplayInstallOriginMetadata,
  EReplayInstallStep,
  TInstalledHighlighterApp,
  TOpenedFrom,
} from './models/highlighter.models';
import {
  EExportStep,
  IAudioInfo,
  IExportInfo,
  IExportOptions,
  ITransitionInfo,
  IVideoInfo,
  TFPS,
  TPreset,
  TResolution,
} from './models/rendering.models';
import { TOrientation, EOrientation, EGame } from './models/ai-highlighter.models';
import { HighlighterViews } from './highlighter-views';
import { startRendering } from './rendering/start-rendering';
import { getVideoDuration } from './video-info';
import { fileExists } from './file-utils';
import { addVerticalFilterToExportOptions } from './vertical-export';
import { isGameSupported } from './models/game-config.models';
import Utils from 'services/utils';
import { getOS, OS } from '../../util/operating-systems';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ENavMenuKey } from '../nav-menu';

const execAsync = promisify(exec);

@InitAfter('StreamingService')
export class HighlighterService extends PersistentStatefulService<IHighlighterState> {
  @Inject() streamingService: StreamingService;
  @Inject() userService: UserService;
  @Inject() usageStatisticsService: UsageStatisticsService;
  @Inject() dismissablesService: DismissablesService;
  @Inject() notificationsService: NotificationsService;
  @Inject() jsonrpcService: JsonrpcService;
  @Inject() navigationService: NavigationService;
  @Inject() sharedStorageService: SharedStorageService;

  static defaultState: IHighlighterState = {
    clips: {},
    transition: {
      type: 'fade',
      duration: 1,
    },
    video: {
      intro: { path: '', duration: null },
      outro: { path: '', duration: null },
    },
    audio: {
      musicEnabled: false,
      musicPath: '',
      musicVolume: 50,
    },
    export: {
      exporting: false,
      currentFrame: 0,
      totalFrames: 0,
      step: EExportStep.AudioMix,
      cancelRequested: false,
      file: '',
      previewFile: path.join(os.tmpdir(), 'highlighter-preview.mp4'),
      exported: false,
      error: null,
      fps: 30,
      resolution: 1080,
      preset: 'medium',
    },
    uploads: [],
    dismissedTutorial: false,
    error: '',
    useAiHighlighter: false,
    tempRecordingInfo: {},
    replayInstall: {
      step: 'idle',
      progress: 0,
      error: null,
    },
  };

  // Replay (AI Highlighter) is Windows-only
  aiHighlighterFeatureEnabled = getOS() === OS.Windows || Utils.isDevMode();

  /**
   * Whether AI Highlighter should start recording and replay buffer outputs.
   * Checks feature flag, user preference, and game support.
   */
  get shouldStartHighlighterOutputs(): boolean {
    return (
      this.aiHighlighterFeatureEnabled &&
      this.views.useAiHighlighter &&
      !!isGameSupported(this.streamingService.views.game)
    );
  }

  static filter(state: IHighlighterState) {
    return {
      ...this.defaultState,
      clips: state.clips,
      video: state.video,
      audio: state.audio,
      transition: state.transition,
      useAiHighlighter: state.useAiHighlighter,
    };
  }

  /**
   * A dictionary of actual clip classes.
   * These are not serializable so kept out of state.
   */
  renderingClips: Dictionary<RenderingClip> = {};
  directoryCleared = false;

  @mutation()
  ADD_CLIP(clip: TClip) {
    Vue.set(this.state.clips, clip.path, clip);
    this.state.export.exported = false;
  }

  @mutation()
  UPDATE_CLIP(clip: Partial<TClip> & { path: string }) {
    Vue.set(this.state.clips, clip.path, {
      ...this.state.clips[clip.path],
      ...clip,
    });
    this.state.export.exported = false;
  }

  @mutation()
  REMOVE_CLIP(clipPath: string) {
    Vue.delete(this.state.clips, clipPath);
    this.state.export.exported = false;
  }

  @mutation()
  SET_EXPORT_INFO(exportInfo: Partial<IExportInfo>) {
    this.state.export = {
      ...this.state.export,
      exported: false,
      ...exportInfo,
    };
  }

  @mutation()
  SET_UPLOAD_INFO(uploadInfo: Partial<IUploadInfo> & { platform: EUploadPlatform }) {
    const platform = uploadInfo.platform;
    const existingIndex = this.state.uploads.findIndex(u => u.platform === platform);

    if (existingIndex !== -1) {
      this.state.uploads = [
        ...this.state.uploads.slice(0, existingIndex),
        { ...this.state.uploads[existingIndex], ...uploadInfo },
        ...this.state.uploads.slice(existingIndex + 1),
      ];
    } else {
      const newUpload: IUploadInfo = {
        uploading: false,
        uploadedBytes: 0,
        totalBytes: 0,
        cancelRequested: false,
        videoId: null,
        error: false,
        ...uploadInfo,
      };
      this.state.uploads.push(newUpload);
    }
  }

  @mutation()
  CLEAR_UPLOAD() {
    this.state.uploads = [];
  }

  @mutation()
  SET_TRANSITION_INFO(transitionInfo: Partial<ITransitionInfo>) {
    this.state.transition = {
      ...this.state.transition,
      ...transitionInfo,
    };
    this.state.export.exported = false;
  }

  @mutation()
  SET_AUDIO_INFO(audioInfo: Partial<IAudioInfo>) {
    this.state.audio = {
      ...this.state.audio,
      ...audioInfo,
    };
    this.state.export.exported = false;
  }

  @mutation()
  SET_VIDEO_INFO(videoInfo: Partial<IVideoInfo>) {
    this.state.video = {
      ...this.state.video,
      ...videoInfo,
    };
    this.state.export.exported = false;
  }

  @mutation()
  DISMISS_TUTORIAL() {
    this.state.dismissedTutorial = true;
  }

  @mutation()
  SET_ERROR(error: string) {
    this.state.error = error;
  }

  @mutation()
  SET_USE_AI_HIGHLIGHTER(useAiHighlighter: boolean) {
    Vue.set(this.state, 'useAiHighlighter', useAiHighlighter);
    this.state.useAiHighlighter = useAiHighlighter;
  }

  @mutation()
  SET_TEMP_RECORDING_INFO(tempRecordingInfo: ITempRecordingInfo) {
    this.state.tempRecordingInfo = tempRecordingInfo;
  }

  @mutation()
  SET_REPLAY_INSTALL(installState: Partial<IReplayInstallState>) {
    this.state.replayInstall = {
      ...this.state.replayInstall,
      ...installState,
    };
  }

  // =================================================================================================
  // STREAMLABS REPLAY MIGRATION logic
  // =================================================================================================

  /**
   * Checks whether an app is installed by looking up its deeplink protocol handler in the Windows
   * Registry. Registering the protocol is the only trace either app leaves that we can rely on.
   * @returns Promise<boolean> - true if the protocol is registered to an executable
   */
  private async isProtocolRegistered(protocol: string): Promise<boolean> {
    // Only check on Windows
    if (getOS() !== OS.Windows) {
      return false;
    }

    try {
      // Query the Windows Registry for the protocol handler command
      const { stdout, stderr } = await execAsync(
        `reg query "HKEY_CLASSES_ROOT\\${protocol}\\shell\\open\\command" /ve`,
        {
          timeout: 5000,
        },
      );

      // Check if stderr is empty and stdout contains meaningful data
      if (stderr) {
        return false;
      }

      // Check if the output contains an actual executable path
      const hasValidCommand = stdout.includes('.exe');

      return hasValidCommand;
    } catch (error: unknown) {
      // If the registry key doesn't exist, reg query will throw an error
      return false;
    }
  }

  /**
   * Checks if Streamlabs Replay is installed by verifying the Windows deeplink protocol registration
   * @returns Promise<boolean> - true if the ${REPLAY_PROTOCOL} protocol is registered, false otherwise
   */
  async isStreamlabsReplayInstalled(): Promise<boolean> {
    return this.isProtocolRegistered(REPLAY_PROTOCOL);
  }

  /**
   * Checks if the standalone Streamlabs Highlighter app — the one Replay replaces — is installed.
   * @returns Promise<boolean> - true if the ${HIGHLIGHTER_PROTOCOL} protocol is registered
   */
  async isStreamlabsHighlighterInstalled(): Promise<boolean> {
    return this.isProtocolRegistered(HIGHLIGHTER_PROTOCOL);
  }

  /**
   * Single source of truth for which app Desktop should talk to.
   *
   * Replay wins whenever it exists, so a user who has both is never sent backwards. Highlighter
   * only answers when Replay is absent, and that user is handed to Highlighter rather than having
   * Replay installed underneath them: Highlighter is where the data merge happens, and it installs
   * Replay at the end of it.
   *
   * The Highlighter lookup is skipped entirely once Replay is found — that is the common case and
   * it should not pay for a second registry query.
   */
  async getInstalledHighlighterApp(): Promise<TInstalledHighlighterApp> {
    if (await this.isStreamlabsReplayInstalled()) return 'replay';
    if (await this.isStreamlabsHighlighterInstalled()) return 'highlighter';
    return 'none';
  }

  /**
   * Checks if the StreamlabsRecorder.exe process is currently running
   * @returns Promise<boolean> - true if process is running, false otherwise
   */
  async isStreamlabsRecorderRunning(): Promise<boolean> {
    // Only check on Windows
    if (getOS() !== OS.Windows) {
      return false;
    }

    try {
      const { stdout } = await execAsync('tasklist /FI "IMAGENAME eq StreamlabsRecorder.exe"', {
        timeout: 5000,
      });

      // Check if the process name appears in the output
      const isRunning = stdout.includes('StreamlabsRecorder.exe');

      return isRunning;
    } catch (error: unknown) {
      return false;
    }
  }

  // =================================================================================================
  // STREAMLABS REPLAY INSTALLATION logic
  // =================================================================================================

  private getReplaySetupUrl(): string {
    if (Utils.getHighlighterEnvironment() === 'production') {
      return REPLAY_SETUP_URL_PRODUCTION;
    }
    return REPLAY_SETUP_URL_STAGING;
  }

  /**
   * Verifies the Authenticode signature of a Windows executable using PowerShell.
   * Throws if the signature is invalid or the subject does not contain 'Logitech Inc' (Streamlabs Replay publisher).
   *
   * Revocation is checked in Offline mode only (cached CRLs, no network calls), so an unreachable
   * or slow CA endpoint can never hang the check.
   *
   * Exit-1 (unsigned/invalid) and exit-2 (wrong publisher) are deterministic verdicts and fail fast.
   * Any other failure (PowerShell killed by the timeout, the freshly-downloaded exe still locked by
   * antivirus, a PowerShell environment issue, etc.) is transient and retried a few times before
   * giving up. Full error detail is reported to Sentry so these can be told apart in the field.
   */
  private async verifyAuthenticodeSignature(filePath: string): Promise<void> {
    // Use PS single-quote escaping then encode as UTF-16LE base64
    // to avoid any command-line quoting/injection issues with the file path.
    const escapedPath = filePath.replace(/'/g, "''");

    // Verify the signature without ever performing an ONLINE revocation lookup.
    // Get-AuthenticodeSignature gives us the local integrity verdict (is the file signed,
    // does the embedded hash match the bytes) and the signer certificate. We then validate
    // trust ourselves with an X509Chain in Offline revocation mode: it consults only cached
    // CRLs, never dials out to the CA (so an unreachable/slow CRL/OCSP endpoint can't hang us),
    // and DisableCertificateDownloads stops it fetching missing intermediates over AIA.
    // IgnoreRevocationUnknown means "can't determine revocation" is not fatal, while a cert the
    // cache already knows is revoked still fails the build.
    // Exit codes: 1 = unsigned/tampered/untrusted, 2 = wrong publisher, 0 = valid.
    const script = [
      "$ErrorActionPreference = 'Stop'",
      `try { $sig = Get-AuthenticodeSignature -LiteralPath '${escapedPath}' } catch { exit 1 }`,
      'if ($null -eq $sig -or $null -eq $sig.SignerCertificate) { exit 1 }',
      "if ($sig.Status -eq 'NotSigned' -or $sig.Status -eq 'HashMismatch') { exit 1 }",
      '$chain = New-Object System.Security.Cryptography.X509Certificates.X509Chain',
      "$chain.ChainPolicy.RevocationMode = 'Offline'",
      "$chain.ChainPolicy.RevocationFlag = 'EntireChain'",
      "$chain.ChainPolicy.VerificationFlags = 'IgnoreEndRevocationUnknown, IgnoreCertificateAuthorityRevocationUnknown, IgnoreRootRevocationUnknown'",
      'try { $chain.ChainPolicy.DisableCertificateDownloads = $true } catch {}',
      'if (-not $chain.Build($sig.SignerCertificate)) { exit 1 }',
      "if ($sig.SignerCertificate.Subject -notmatch 'CN=Logitech Inc') { exit 2 }",
      'exit 0',
    ].join('; ');
    const encodedCommand = Buffer.from(script, 'utf16le').toString('base64');

    const MAX_ATTEMPTS = 3;
    const RETRY_DELAY_MS = 2000;

    type ExecError = Error & {
      code?: number | null;
      killed?: boolean;
      signal?: string | null;
      stdout?: string;
      stderr?: string;
    };

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await execAsync(`powershell -NonInteractive -NoProfile -EncodedCommand ${encodedCommand}`, {
          timeout: 30000,
        });
        return;
      } catch (e: unknown) {
        const err = e as ExecError;
        const code = err.code ?? -1;

        // Deterministic signature verdicts — retrying will not change the outcome, so fail fast.
        if (code === 1) {
          throw new Error('Installer signature verification failed: invalid or missing signature.');
        }
        if (code === 2) {
          throw new Error(
            'Installer signature verification failed: publisher does not match Logitech Inc.',
          );
        }

        // Transient/tooling failure (timeout, AV file lock, slow revocation lookup, PS env issue).
        const isLastAttempt = attempt === MAX_ATTEMPTS;
        Sentry.withScope(scope => {
          scope.setTag('feature', 'highlighter');
          scope.setTag('replayInstallPhase', 'verify-signature');
          scope.setTag('signatureCheckAttempt', String(attempt));
          scope.setTag('signatureCheckExitCode', String(err.code ?? 'null'));
          scope.setTag('signatureCheckKilled', String(err.killed ?? false));
          scope.setExtra('signatureCheckSignal', err.signal ?? null);
          scope.setExtra('signatureCheckStdout', err.stdout ?? '');
          scope.setExtra('signatureCheckStderr', err.stderr ?? '');
          console.error(
            `Installer signature check attempt ${attempt}/${MAX_ATTEMPTS} failed:`,
            err.message,
          );
        });

        if (isLastAttempt) {
          throw new Error(`Installer signature check failed: ${err.message}`);
        }

        await this.wait(RETRY_DELAY_MS);
      }
    }
  }

  /**
   * Dev-only escape hatch for testing the install flow against a locally built Replay installer
   * instead of the CDN one. Set HIGHLIGHTER_LOCAL_SETUP_PATH to the setup exe before launching, e.g.
   *
   *   set "HIGHLIGHTER_LOCAL_SETUP_PATH=C:\path\to\Streamlabs Highlighter-0.0.16 Setup.exe"
   *
   * Read from remote.process.env at runtime (via Utils.env), so it takes effect on the next
   * `yarn start` with no rebuild — unlike HIGHLIGHTER_ENV, which webpack bakes in at compile time.
   *
   * Gated on dev mode: a local build is not signed by Logitech, so this path skips the Authenticode
   * check, and that check must stay unconditional in shipped builds.
   *
   * Throws if the path is set but missing, rather than silently falling back to the CDN download —
   * a typo should be visible, not quietly ignored.
   */
  private async getLocalReplaySetupPath(): Promise<string | null> {
    if (!Utils.isDevMode()) return null;

    const configuredPath = Utils.env.HIGHLIGHTER_LOCAL_SETUP_PATH?.trim();
    if (!configuredPath) return null;

    // Tolerate a value pasted with surrounding quotes, which is easy to do for a path with spaces
    const setupPath = path.resolve(configuredPath.replace(/^"(.*)"$/, '$1'));

    if (!(await fs.pathExists(setupPath))) {
      throw new Error(
        `HIGHLIGHTER_LOCAL_SETUP_PATH is set but no installer exists at "${setupPath}".`,
      );
    }

    return setupPath;
  }

  /**
   * Where Replay looks for the install origin marker, given who we are running as.
   *
   * Replay reads exactly one location: the current user's temp directory. A parent writing under a
   * different identity gets a different %TEMP% — SYSTEM and services land in C:\Windows\TEMP or a
   * profile under the Windows directory — and the marker would sit somewhere Replay never reads.
   * Those identities are recognised by their profile: SYSTEM sits in
   * C:\Windows\system32\config\systemprofile and the service accounts in C:\Windows\ServiceProfiles,
   * both under %SystemRoot%. Elevation alone is fine: "run as administrator" from the user's own
   * account keeps the profile.
   *
   * Deliberately does not require temp to sit under the home directory. %TEMP% is an ordinary
   * per-user environment variable, and redirecting it to another drive or an enterprise-managed
   * path is a supported configuration — Replay, running as the same user, resolves the same
   * redirected path, so the hand-off still works.
   *
   * Throws rather than returning a path we know Replay will not read.
   */
  private getReplayInstallOriginMarkerPath(): string {
    const isInside = (child: string, parent: string) => {
      const relativePath = path.relative(parent, child);
      return (
        relativePath !== '' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath)
      );
    };

    const temp = remote.app.getPath('temp');
    const home = remote.app.getPath('home');
    const systemRoot = remote.process.env.SystemRoot ?? 'C:\\Windows';

    if (isInside(home, systemRoot)) {
      throw new Error(`"${temp}" is not the desktop user's temp directory`);
    }

    return path.join(temp, REPLAY_INSTALL_ORIGIN_DIR_NAME, REPLAY_INSTALL_ORIGIN_FILE_NAME);
  }

  /**
   * Writes the marker Streamlabs Replay reads on first run to attribute the install to
   * Streamlabs Desktop.
   *
   * Must run before the installer is executed: Squirrel's Setup.exe launches Replay at the end of
   * the install, so Replay can resolve its origin while our exec call is still pending.
   *
   * When the install was triggered from the import dialog, the marker also carries what the user
   * picked there, under `metadata`: the recording and its game. Those are the exact values Desktop
   * would otherwise pass via the `import` deeplink once the install finishes, so Replay can see it
   * coming — the marker is the hand-off for that single import, not a second unrelated one.
   *
   * Best-effort by design. Attribution is never worth failing an install over, so every error is
   * swallowed and only reported to Sentry.
   */
  private async writeReplayInstallOriginMarker(
    metadata?: IReplayInstallOriginMetadata,
  ): Promise<void> {
    try {
      const markerPath = this.getReplayInstallOriginMarkerPath();

      const videoPath = metadata?.videoPath?.trim();
      const game = metadata?.game;

      // Only carry entries we actually have: an absent key is easier for Replay to reason about
      // than one holding an empty value.
      const markerMetadata = {
        ...(videoPath ? { videoPath } : {}),
        ...(game ? { game } : {}),
      };
      const hasMetadata = Object.keys(markerMetadata).length > 0;

      // outputJson creates the containing directory if it does not exist yet.
      // `metadata` itself is omitted when there is nothing to hand over, so Replay never has to
      // tell an empty object apart from a missing one.
      await fs.outputJson(markerPath, {
        version: 1,
        origin: REPLAY_INSTALL_ORIGIN,
        createdAt: new Date().toISOString(),
        ...(hasMetadata ? { metadata: markerMetadata } : {}),
      });

      // Replay logs the path it looked at on every launch until the origin settles. Two paths that
      // do not match is the whole diagnosis, so log ours and the identity that wrote it.
      console.log(
        `Wrote Streamlabs Replay install origin marker to "${markerPath}" as "${
          os.userInfo().username
        }"${hasMetadata ? ` with ${JSON.stringify(markerMetadata)}` : ''}`,
      );
    } catch (error: unknown) {
      Sentry.withScope(scope => {
        scope.setTag('feature', 'highlighter');
        scope.setTag('replayInstallPhase', 'write-install-origin');
        console.error('Failed to write Streamlabs Replay install origin marker:', error);
        // Captured explicitly on top of the console line: a silently lost marker costs the user
        // their import hand-off, so it is worth a real exception event — with a stack and grouped
        // by what actually failed — rather than only the message event the console patch sends.
        Sentry.captureException(error);
      });
    }
  }

  /**
   * Downloads and installs Streamlabs Replay.
   * Fakes progress increments during the download/install phases,
   * verifies the deeplink registry after install, and auto-launches the app.
   *
   * @param originMetadata - Optional hand-off data for the install origin marker: the video and
   * game the import dialog wants Replay to open with. Passing it here is what replaces the import
   * deeplink — Replay reads the marker on its first launch, so nothing is sent afterwards.
   */
  private replayInstallAbortController: AbortController | null = null;

  async installStreamlabsReplay(originMetadata?: IReplayInstallOriginMetadata): Promise<boolean> {
    if (getOS() !== OS.Windows) {
      Sentry.withScope(scope => {
        scope.setTag('feature', 'highlighter');
        scope.setTag('replayInstallPhase', 'os-check');
        console.error('Streamlabs Replay installation failed: unsupported OS');
      });
      this.SET_REPLAY_INSTALL({
        step: 'error',
        error: 'Installation is only supported on Windows',
      });
      return false;
    }

    // Abort any previous in-flight install
    this.replayInstallAbortController?.abort();
    this.replayInstallAbortController = new AbortController();
    const { signal } = this.replayInstallAbortController;

    // Track installation started
    this.usageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
      type: 'ReplayInstallationStarted',
    });

    let progressInterval: NodeJS.Timeout | null = null;

    const clearProgress = () => {
      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }
    };

    try {
      // --- Downloading phase ---
      this.SET_REPLAY_INSTALL({ step: 'downloading', progress: 0, error: null });

      // Dev only. When set, this is a locally built installer we neither downloaded nor own,
      // so the download, the signature check and the cleanup below are all skipped for it.
      const localSetupPath = await this.getLocalReplaySetupPath();
      let setupPath: string;

      if (localSetupPath) {
        console.info('Installing Streamlabs Replay from local build:', localSetupPath);
        setupPath = localSetupPath;
        this.setReplayDownloadProgress(94);
      } else {
        const setupUrl = this.getReplaySetupUrl();

        // Download the setup exe to temp directory
        const tempDir = os.tmpdir();
        setupPath = path.join(tempDir, REPLAY_SETUP_EXE_NAME);

        await downloadFile(setupUrl, setupPath, (progress: IDownloadProgress) => {
          // Map download progress to 0-94%
          const downloadPercent = progress.percent * 94;
          this.setReplayDownloadProgress(downloadPercent);
        });
      }

      clearProgress();

      if (signal.aborted) {
        this.usageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
          type: 'ReplayInstallationCancelled',
          phase: 'downloading',
        });
        return false;
      }

      if (localSetupPath) {
        // A local build is not signed by Logitech, so the check would always fail here
        console.warn('Skipping installer signature verification for local Streamlabs Replay build');
      } else {
        // Verify the Authenticode signature before execution
        await this.verifyAuthenticodeSignature(setupPath);
      }

      // Attribute this install to Streamlabs Desktop before the installer runs, and hand over
      // whatever we already know about what comes next (the video and game to import).
      // Best-effort: this never throws and never blocks the install.
      await this.writeReplayInstallOriginMarker(originMetadata);

      // --- Installing phase ---
      this.SET_REPLAY_INSTALL({ step: 'installing', progress: 94 });

      // Fake progress for install phase
      progressInterval = setInterval(() => {
        const current = this.state.replayInstall.progress;
        if (current < 95) {
          const increment = Math.max(0.3, (95 - current) * 0.03);
          this.setReplayDownloadProgress(Math.min(95, current + increment));
        }
      }, 500);

      // Run the installer silently
      await execAsync(`"${setupPath}"`, { timeout: 120000 });

      clearProgress();

      if (signal.aborted) {
        this.usageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
          type: 'ReplayInstallationCancelled',
          phase: 'installing',
        });
        return false;
      }

      this.setReplayDownloadProgress(95);

      // --- Verifying phase ---
      this.SET_REPLAY_INSTALL({ step: 'verifying', progress: 96 });

      // Wait a moment for registry to propagate
      await this.wait(2000);

      if (signal.aborted) {
        this.usageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
          type: 'ReplayInstallationCancelled',
          phase: 'verifying',
        });
        return false;
      }

      const isInstalled = await this.isStreamlabsReplayInstalled();
      if (!isInstalled) {
        throw new Error(
          'Installation could not be verified. The deeplink protocol was not registered.',
        );
      }
      this.SET_REPLAY_INSTALL({ step: 'done', progress: 100 });

      // Auto-launch Streamlabs Replay
      try {
        remote.shell.openExternal(`${REPLAY_PROTOCOL}://open`);
      } catch (launchError: unknown) {
        Sentry.withScope(scope => {
          scope.setTag('feature', 'highlighter');
          scope.setTag('replayInstallPhase', 'auto-launch');
          console.error('Failed to auto-launch Streamlabs Replay:', launchError);
        });
      }

      // Clean up setup file. Never for a local build — that is the developer's own artifact.
      if (!localSetupPath) {
        try {
          await fs.remove(setupPath);
        } catch {
          // Non-critical cleanup
        }
      }

      // Track installation finished successfully
      this.usageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
        type: 'ReplayInstallationFinished',
      });

      return true;
    } catch (error: unknown) {
      clearProgress();
      if (signal.aborted) {
        this.usageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
          type: 'ReplayInstallationCancelled',
          phase: 'error',
        });
        return false;
      }
      const errorMessage = error instanceof Error ? error.message : 'Unknown installation error';
      const failedPhase = this.state.replayInstall.step;
      Sentry.withScope(scope => {
        scope.setTag('feature', 'highlighter');
        scope.setTag('replayInstallPhase', failedPhase);
        console.error('Streamlabs Replay installation failed:', errorMessage);
      });
      this.SET_REPLAY_INSTALL({ step: 'error', progress: 0, error: errorMessage });

      // Track installation failed
      this.usageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
        type: 'ReplayInstallationFailed',
        phase: failedPhase,
      });

      return false;
    } finally {
      if (this.replayInstallAbortController?.signal === signal) {
        this.replayInstallAbortController = null;
      }
    }
  }

  cancelReplayInstall() {
    const wasInstalling =
      this.state.replayInstall.step !== 'idle' &&
      this.state.replayInstall.step !== 'done' &&
      this.state.replayInstall.step !== 'error';

    // Track cancellation if an installation was in progress
    if (wasInstalling) {
      this.usageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
        type: 'ReplayInstallationCancelled',
        phase: this.state.replayInstall.step,
      });
    }

    this.replayInstallAbortController?.abort();
    this.replayInstallAbortController = null;
    this.SET_REPLAY_INSTALL({ step: 'idle', progress: 0, error: null });
  }

  /**
   * Launches an app through its deeplink protocol, falling back to the bare scheme.
   * @returns Promise<boolean> - false when neither form could be opened, which in practice means
   * the protocol is registered but the app itself is gone.
   */
  private async openProtocol(protocol: string): Promise<boolean> {
    try {
      await remote.shell.openExternal(`${protocol}://open`);
      return true;
    } catch (error: unknown) {
      Sentry.withScope(scope => {
        scope.setTag('feature', 'highlighter');
        console.error(`Failed to open "${protocol}":`, error);
      });
      try {
        await remote.shell.openExternal(`${protocol}:`);
        return true;
      } catch (fallbackError: unknown) {
        Sentry.withScope(scope => {
          scope.setTag('feature', 'highlighter');
          console.error(`Failed to open "${protocol}" with fallback:`, fallbackError);
        });
        return false;
      }
    }
  }

  /**
   * Opens whichever app the user should land in, installing Replay when there is none.
   *
   * - Replay installed -> open Replay (whether or not Highlighter is also still around).
   * - Only Highlighter installed -> open Highlighter. It owns the data merge and installs Replay
   *   at the end of it, so Desktop must not install Replay behind its back.
   * - Neither -> install Replay.
   *
   * A protocol that is registered but will not launch means the app was removed without
   * unregistering, so it falls through to the install.
   *
   * @param source - Where the action was initiated from ('page' or 'modal')
   * @returns Promise<boolean> - true if an app was opened, false if installation was started
   */
  async openReplay(source: 'page' | 'modal'): Promise<boolean> {
    const app = await this.getInstalledHighlighterApp();

    if (app === 'replay') {
      this.usageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
        type: 'ReplayOpen',
        source,
      });
      if (await this.openProtocol(REPLAY_PROTOCOL)) return true;
    } else if (app === 'highlighter') {
      this.usageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
        type: 'HighlighterAppOpen',
        source,
      });
      if (await this.openProtocol(HIGHLIGHTER_PROTOCOL)) return true;
    }

    // Track installation click
    this.usageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
      type: 'ReplayInstallationClick',
      source,
    });

    // Start installation flow for Streamlabs Replay (don't await so UI can update)
    this.installStreamlabsReplay();
    return false;
  }

  /**
   * Opens the installed app with an import deeplink.
   *
   * Both apps take the same `import` route and the same params, so the only thing that varies is
   * the protocol. A Highlighter user is deeplinked into Highlighter rather than Replay: the import
   * lands in the app that still holds their data.
   *
   * Callers gate on {@link getInstalledHighlighterApp} first — with nothing installed there is no
   * app to deeplink into, and that path runs the installer instead.
   *
   * @param videoPath - Path to the video file to import
   * @param game - The game type for the video
   * @param openedFrom - Where the import was initiated from
   * @param streamId - Optional stream ID for tracking
   * @param title - Optional title for the recording
   */
  async openReplayImport(
    videoPath: string,
    game: string,
    openedFrom: TOpenedFrom,
    streamId?: string,
    title?: string,
  ): Promise<void> {
    const app = await this.getInstalledHighlighterApp();
    const protocol = app === 'highlighter' ? HIGHLIGHTER_PROTOCOL : REPLAY_PROTOCOL;

    let deeplink = `${protocol}://import?path=${encodeURIComponent(
      videoPath,
    )}&game=${encodeURIComponent(game)}`;

    if (title) {
      deeplink += `&title=${encodeURIComponent(title)}`;
    }

    remote.shell.openExternal(deeplink);

    // Tracked as a separate event rather than a flag on ReplayImport so a migration-era Highlighter
    // import never inflates the Replay import numbers.
    this.usageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
      type: app === 'highlighter' ? 'HighlighterAppImport' : 'ReplayImport',
      openedFrom,
      streamId,
      game,
    });
  }
  requestStopRecordingReplay() {
    remote.shell.openExternal(`${REPLAY_PROTOCOL}://stop-recording`);

    this.usageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
      type: 'ReplayRequestStopRecording',
    });
  }

  // =================================================================================================
  // Legacy AI Highlighter (in-app binary) uninstall support
  // =================================================================================================

  private get legacyAiHighlighterPath() {
    return path.join(remote.app.getPath('userData'), '..', 'streamlabs-highlighter');
  }

  /**
   * Returns the installed version of the legacy in-app AI Highlighter binary,
   * an empty string if it is installed but the version is unknown,
   * or null if it is not installed.
   */
  async getLegacyAiHighlighterVersion(): Promise<string | null> {
    if (!(await fs.pathExists(this.legacyAiHighlighterPath))) return null;

    try {
      const manifest = await fs.readJson(path.join(this.legacyAiHighlighterPath, 'manifest.json'));
      return manifest?.version ?? '';
    } catch (e: unknown) {
      return '';
    }
  }

  async uninstallLegacyAiHighlighter() {
    this.usageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
      type: 'Uninstallation',
    });

    if (await fs.pathExists(this.legacyAiHighlighterPath)) {
      console.log('uninstalling legacy AI Highlighter...');
      await fs.remove(this.legacyAiHighlighterPath);
    }
  }

  // =================================================================================================
  // CLIP EDITOR logic
  // =================================================================================================

  get views() {
    return new HighlighterViews(this.state);
  }

  async init() {
    super.init();
    this.migrateLegacyClips();

    //Check if files are existent, if not, delete
    this.views.clips.forEach(c => {
      if (!fileExists(c.path)) {
        this.removeClip(c.path);
      }
    });

    if (this.views.exportInfo.exporting) {
      this.SET_EXPORT_INFO({
        exporting: false,
        error: null,
        cancelRequested: false,
      });
    }

    // Selection is working state for the next export: every session starts with nothing
    // selected, which also keeps the editor panel hidden until the user picks clips.
    this.views.clips.forEach(c => {
      this.UPDATE_CLIP({
        path: c.path,
        loaded: false,
        enabled: false,
      });
    });

    try {
      // On some very very small number of systems, we won't be able to fetch
      // the videos path from the system.
      // TODO: Add a fallback directory?
      this.SET_EXPORT_INFO({
        file: path.join(remote.app.getPath('videos'), 'Output.mp4'),
      });
    } catch (e: unknown) {
      console.error('Got error fetching videos directory', e);
    }

    this.handleStreamingChanges();
  }

  /**
   * Clips created by the removed in-app AI detection were persisted with `source: 'AiClip'`,
   * detection metadata (`aiInfo`) and a per-stream `streamInfo`. The clip files are still the
   * user's content, so they are kept as plain manual clips with the legacy fields dropped.
   */
  private migrateLegacyClips() {
    this.views.clips.forEach(clip => {
      const legacyClip = clip as TClip & { aiInfo?: unknown; streamInfo?: unknown };
      const isLegacyAiClip = (legacyClip.source as string) === 'AiClip';
      if (!isLegacyAiClip && !('aiInfo' in legacyClip) && !('streamInfo' in legacyClip)) return;

      const { aiInfo, streamInfo, ...migratedClip } = legacyClip;
      this.ADD_CLIP({
        ...migratedClip,
        source: isLegacyAiClip ? 'Manual' : migratedClip.source,
      } as TClip);
    });
  }

  private handleStreamingChanges() {
    let streamInfo: IStreamInfoForAiHighlighter;
    let streamStarted = false;
    let aiRecordingInProgress = false;
    // Replay buffer clips saved during the current stream, loaded when the stream ends
    let streamReplayClipPaths: string[] = [];

    this.streamingService.replayBufferFileWrite.subscribe(async clipPath => {
      this.addClips([{ path: clipPath }], 'ReplayBuffer');
      if (streamStarted) streamReplayClipPaths.push(clipPath);
    });

    this.streamingService.streamingStatusChange.subscribe(async status => {
      if (status === EStreamingState.Live) {
        streamReplayClipPaths = [];
        streamStarted = true; // console.log('live', this.streamingService.views.settings.platforms.twitch.title);
        const streamId = 'fromStreamRecording' + uuid();

        this.usageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
          type: 'AiRecordingGoinglive',
          streamId,
          game: this.streamingService.views.game,
        });

        if (!this.aiHighlighterFeatureEnabled) {
          this.usageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
            type: 'AiHighlighterFeatureNotEnabled',
            streamId,
            game: this.streamingService.views.game,
          });
          return;
        }

        if (this.views.useAiHighlighter === false) {
          return;
        }

        this.usageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
          type: 'AiRecordingHighlighterIsActive',
          streamId,
          game: this.streamingService.views.game,
        });

        if (!isGameSupported(this.streamingService.views.game)) {
          return;
        }

        let game;
        const normalizedGameName = isGameSupported(this.streamingService.views.game);
        if (normalizedGameName) {
          game = normalizedGameName as EGame;
        } else {
          game = EGame.UNSET;
        }

        streamInfo = {
          id: streamId,
          title: this.streamingService.views.settings.platforms.twitch?.title,
          game,
        };

        this.usageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
          type: 'AiRecordingStarted',
          streamId: streamInfo?.id,
        });

        // Recording and replay buffer are started by handleStartStreaming
        // before the Live status is emitted, so they should already be active.
        if (aiRecordingInProgress) return;
        aiRecordingInProgress = true;
      }

      if (status === EStreamingState.Offline) {
        if (
          streamStarted &&
          this.views.clips.length > 0 &&
          this.dismissablesService.views.shouldShow(EDismissable.HighlighterNotification)
        ) {
          this.notificationsService.push({
            type: ENotificationType.SUCCESS,
            lifeTime: -1,
            message: $t(
              'Edit your replays with Highlighter, a free editor built in to Streamlabs.',
            ),
            action: this.jsonrpcService.createRequest(
              Service.getResourceId(this),
              'notificationAction',
            ),
          });

          this.usageStatisticsService.recordAnalyticsEvent(
            this.views.useAiHighlighter ? 'AIHighlighter' : 'Highlighter',
            {
              type: 'NotificationShow',
            },
          );
        }

        streamStarted = false;
      }
      if (status === EStreamingState.Ending) {
        if (!aiRecordingInProgress) {
          return;
        }

        this.usageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
          type: 'AiRecordingFinished',
          streamId: streamInfo?.id,
          game: this.streamingService.views.game,
        });

        // Load only this stream's replay buffer clips, not the whole library
        await this.loadClips(streamReplayClipPaths);
      }
    });

    this.streamingService.latestRecordingPath.subscribe(path => {
      if (!aiRecordingInProgress) {
        return;
      }
      // Check if recording is immediately available
      getVideoDuration(path)
        .then(duration => {
          if (isNaN(duration)) {
            duration = -1;
          }
          this.usageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
            type: 'AiRecordingExists',
            duration,
            streamId: streamInfo?.id,
            game: this.streamingService.views.game,
          });
        })
        .catch(error => {
          console.error('Failed getting duration right after the recoding.', error);
        });

      aiRecordingInProgress = false;

      const tempRecordingInfo: ITempRecordingInfo = {
        recordingPath: path,
        streamInfo,
        source: 'after-stream',
      };

      this.setTempRecordingInfo(tempRecordingInfo);

      this.navigationService.actions.navigate('Highlighter', {}, ENavMenuKey.Highlighter);
    });
  }

  notificationAction() {
    this.navigationService.navigate('Highlighter');
    this.dismissablesService.dismiss(EDismissable.HighlighterNotification);
    this.usageStatisticsService.recordAnalyticsEvent(
      this.views.useAiHighlighter ? 'AIHighlighter' : 'Highlighter',
      {
        type: 'NotificationClick',
      },
    );
  }

  setTransition(transition: Partial<ITransitionInfo>) {
    this.SET_TRANSITION_INFO(transition);
  }

  setAudio(audio: Partial<IAudioInfo>) {
    this.SET_AUDIO_INFO(audio);
  }

  setVideo(video: Partial<IVideoInfo>) {
    this.SET_VIDEO_INFO(video);
  }

  resetExportedState() {
    this.SET_EXPORT_INFO({ exported: false });
  }
  setExportFile(file: string) {
    this.SET_EXPORT_INFO({ file });
  }

  setFps(fps: TFPS) {
    this.SET_EXPORT_INFO({ fps });
  }

  setResolution(resolution: TResolution) {
    this.SET_EXPORT_INFO({ resolution });
  }

  setPreset(preset: TPreset) {
    this.SET_EXPORT_INFO({ preset });
  }

  dismissError() {
    if (this.state.export.error) this.SET_EXPORT_INFO({ error: null });
    this.state.uploads
      .filter(u => u.error)
      .forEach(u => this.SET_UPLOAD_INFO({ error: false, platform: u.platform }));
    if (this.state.error) this.SET_ERROR('');
  }

  dismissTutorial() {
    this.DISMISS_TUTORIAL();
  }

  // =================================================================================================
  // CLIPS logic
  // =================================================================================================
  addClips(newClips: { path: string }[], source: 'Manual' | 'ReplayBuffer') {
    // Don't add the same clip twice
    const paths = [...new Set(newClips.map(c => c.path))].filter(p => !this.state.clips[p]);
    if (paths.length === 0) return;

    // New clips get prepended so they are visible right away (newest replay on top), so push
    // all existing clips down once by the number of new clips
    this.getClips(this.views.clips).forEach(clip => {
      this.UPDATE_CLIP({
        path: clip.path,
        globalOrderPosition: clip.globalOrderPosition + paths.length,
      });
    });

    const display = this.streamingService.views.getOutputDisplayType();

    paths.forEach((clipPath, index) => {
      this.ADD_CLIP({
        path: clipPath,
        loaded: false,
        enabled: false,
        startTrim: 0,
        endTrim: 0,
        deleted: false,
        source,
        display,
        globalOrderPosition: index,
      });
    });
  }

  manuallyEnableClip(path: string, enabled: boolean) {
    this.usageStatisticsService.recordAnalyticsEvent(
      this.views.useAiHighlighter ? 'AIHighlighter' : 'Highlighter',
      {
        type: 'ManualSelectUnselect',
        selected: enabled,
      },
    );

    this.enableClip(path, enabled);
  }

  enableClip(path: string, enabled: boolean) {
    this.UPDATE_CLIP({
      path,
      enabled,
    });
  }

  setStartTrim(path: string, trim: number) {
    this.UPDATE_CLIP({
      path,
      startTrim: trim,
    });
  }

  setEndTrim(path: string, trim: number) {
    this.UPDATE_CLIP({
      path,
      endTrim: trim,
    });
  }

  async removeClip(removePath: string, deleteClipFromSystem = true) {
    const clip: TClip = this.state.clips[removePath];
    if (!clip) {
      console.warn(`Clip not found for path: ${removePath}`);
      return;
    }

    this.REMOVE_CLIP(removePath);
    this.removeScrubFile(clip.scrubSprite);
    delete this.renderingClips[removePath];

    if (deleteClipFromSystem) {
      try {
        await fs.unlink(removePath);

        // Check if the containing folder is empty, if yes, delete
        const folderPath = path.dirname(removePath);
        const files = await fs.readdir(folderPath);
        if (files.length === 0) {
          await fs.rmdir(folderPath);
        }
      } catch (error: unknown) {
        console.error('Error deleting clip or folder:', error);
        if (error instanceof Error && (error as any).code === 'EBUSY') {
          await remote.dialog.showMessageBox(Utils.getMainWindow(), {
            title: $t('Deletion info'),
            type: 'info',
            message: $t(
              'At least one clip could not be deleted from your system. Please delete it manually.',
            ),
          });
        }
      }
    }
  }

  /**
   * @param paths - Only load these clips. Loads every clip when omitted.
   */
  async loadClips(paths?: string[]) {
    let candidates = this.getClips(this.views.clips);
    if (paths) candidates = candidates.filter(clip => paths.includes(clip.path));
    // this.resetRenderingClips();
    await this.ensureScrubDirectory();

    const supportedExtensions = SUPPORTED_FILE_TYPES.map(e => `.${e}`);
    const clipsToLoad: TClip[] = [];

    for (const clip of candidates) {
      if (!fileExists(clip.path)) {
        this.removeClip(clip.path);
        continue;
      }

      if (!supportedExtensions.includes(path.parse(clip.path).ext)) {
        this.removeClip(clip.path);
        this.SET_ERROR(
          $t(
            'One or more clips could not be imported because they were not recorded in a supported file format.',
          ),
        );
        continue;
      }

      this.renderingClips[clip.path] =
        this.renderingClips[clip.path] ?? new RenderingClip(clip.path, clip.display);
      clipsToLoad.push(clip);
    }

    //TODO M: tracking type not correct
    await pmap(
      clipsToLoad.filter(c => !c.loaded),
      c => this.renderingClips[c.path].init(),
      {
        concurrency: os.cpus().length,
        onProgress: completed => {
          this.usageStatisticsService.recordAnalyticsEvent(
            this.views.useAiHighlighter ? 'AIHighlighter' : 'Highlighter',
            {
              type: 'ClipImport',
              source: completed.source,
            },
          );
          this.UPDATE_CLIP({
            path: completed.path,
            loaded: true,
            scrubSprite: this.renderingClips[completed.path].frameSource?.scrubJpg,
            duration: this.renderingClips[completed.path].duration,
            deleted: this.renderingClips[completed.path].deleted,
          });
        },
      },
    );
    return;
  }

  getClips(clips: TClip[]): TClip[] {
    return clips.filter(clip => {
      if (clip.path === 'add') {
        return false;
      }
      const exists = fileExists(clip.path);
      if (!exists) {
        this.removeClip(clip.path);
        return false;
      }
      return true;
    });
  }

  private hasUnloadedClips() {
    return !this.views.clips.filter(c => c.enabled).every(clip => clip.loaded);
  }

  // =================================================================================================
  // SCRUB logic
  // =================================================================================================
  private async ensureScrubDirectory() {
    try {
      try {
        //If possible to read, directory exists, if not, catch and mkdir
        await fs.readdir(SCRUB_SPRITE_DIRECTORY);
      } catch (error: unknown) {
        await fs.mkdir(SCRUB_SPRITE_DIRECTORY);
      }
    } catch (error: unknown) {
      console.log('Error creating scrub sprite directory');
    }
  }
  async removeScrubFile(clipPath: string | undefined) {
    if (!clipPath) {
      console.warn('No scrub file path provided');
      return;
    }
    try {
      await fs.remove(clipPath);
    } catch (error: unknown) {
      console.error('Error removing scrub file', error);
    }
  }

  // =================================================================================================
  // EXPORT logic
  // =================================================================================================
  /**
   * Exports the video using the currently configured settings
   * Return true if the video was exported, or false if not.
   */
  async export(preview = false, orientation: TOrientation = EOrientation.HORIZONTAL) {
    this.resetRenderingClips();
    await this.loadClips();

    if (this.hasUnloadedClips()) {
      console.error('Highlighter: Export called while clips are not fully loaded!: ');
      return;
    }

    if (this.views.exportInfo.exporting) {
      console.error('Highlighter: Cannot export until current export operation is finished');
      return;
    }
    this.SET_EXPORT_INFO({
      exporting: true,
      currentFrame: 0,
      step: EExportStep.AudioMix,
      cancelRequested: false,
      error: null,
    });

    let renderingClips: RenderingClip[] = await this.generateRenderingClips(orientation);
    const exportOptions: IExportOptions = await this.generateExportOptions(
      renderingClips,
      preview,
      orientation,
    );

    // Reset all clips
    await pmap(renderingClips, c => c.reset(exportOptions), {
      onProgress: c => {
        if (c.deleted) {
          this.UPDATE_CLIP({ path: c.sourcePath, deleted: true });
        }
      },
    });

    // TODO: For now, just remove deleted clips from the video
    // In the future, abort export and surface error to the user.
    renderingClips = renderingClips.filter(c => !c.deleted);

    if (!renderingClips.length) {
      console.error('Highlighter: Export called without any clips!');
      this.SET_EXPORT_INFO({
        exporting: false,
        exported: false,
        error: $t('Please select at least one clip to export a video'),
      });
      return;
    }

    const setExportInfo = (partialExportInfo: Partial<IExportInfo>) => {
      this.SET_EXPORT_INFO(partialExportInfo);
    };
    const recordAnalyticsEvent = (type: TAnalyticsEvent, data: Record<string, unknown>) => {
      this.usageStatisticsService.recordAnalyticsEvent(type, data);
    };
    const handleFrame = (currentFrame: number) => {
      this.setCurrentFrame(currentFrame);
    };

    startRendering(
      {
        isPreview: preview,
        renderingClips,
        exportInfo: this.views.exportInfo,
        exportOptions,
        audioInfo: this.views.audio,
        transitionDuration: this.views.transitionDuration,
        transition: this.views.transition,
        useAiHighlighter: this.views.useAiHighlighter,
      },
      handleFrame,
      setExportInfo,
      recordAnalyticsEvent,
    );
  }

  private async generateExportOptions(
    renderingClips: RenderingClip[],
    preview: boolean,
    orientation: string,
  ) {
    const exportOptions: IExportOptions = preview
      ? { width: 1280 / 4, height: 720 / 4, fps: 30, preset: 'ultrafast' }
      : {
          width: this.views.exportInfo.resolution === 720 ? 1280 : 1920,
          height: this.views.exportInfo.resolution === 720 ? 720 : 1080,
          fps: this.views.exportInfo.fps,
          preset: this.views.exportInfo.preset,
        };

    if (orientation === 'vertical') {
      // adds complex filter and flips width and height
      await addVerticalFilterToExportOptions(renderingClips, exportOptions);
    }
    return exportOptions;
  }

  private async generateRenderingClips(orientation?: string) {
    const renderingClips: RenderingClip[] = this.views.clips
      .filter(c => c.enabled)
      .sort((a: TClip, b: TClip) => a.globalOrderPosition - b.globalOrderPosition)
      .map(c => {
        const clip = this.renderingClips[c.path];

        clip.startTrim = c.startTrim;
        clip.endTrim = c.endTrim;

        return clip;
      });

    if (this.views.video.intro.path && orientation !== 'vertical') {
      const intro: RenderingClip = new RenderingClip(this.views.video.intro.path);
      await intro.init();
      intro.startTrim = 0;
      intro.endTrim = 0;
      renderingClips.unshift(intro);
    }
    if (this.views.video.outro.path && orientation !== 'vertical') {
      const outro = new RenderingClip(this.views.video.outro.path);
      await outro.init();
      outro.startTrim = 0;
      outro.endTrim = 0;
      renderingClips.push(outro);
    }
    return renderingClips;
  }

  @throttle(100)
  private setReplayDownloadProgress(progress: number) {
    const current = this.state.replayInstall.progress;
    if (progress > current) {
      this.SET_REPLAY_INSTALL({ progress });
    }
  }

  // We throttle because this can go extremely fast, especially on previews
  @throttle(100)
  private setCurrentFrame(frame: number) {
    // Avoid a race condition where we reset the exported flag
    if (this.views.exportInfo.exported) return;
    this.SET_EXPORT_INFO({ currentFrame: frame });
  }

  cancelExport() {
    this.SET_EXPORT_INFO({ cancelRequested: true });
  }

  resetRenderingClips() {
    this.renderingClips = {};
  }

  // =================================================================================================
  // AI-HIGHLIGHTER logic
  // =================================================================================================

  setAiHighlighter(state: boolean) {
    this.SET_USE_AI_HIGHLIGHTER(state);
    this.usageStatisticsService.recordAnalyticsEvent('AIHighlighter', {
      type: 'Toggled',
      value: state,
    });
  }

  toggleAiHighlighter() {
    if (this.state.useAiHighlighter) {
      this.SET_USE_AI_HIGHLIGHTER(false);
    } else {
      this.SET_USE_AI_HIGHLIGHTER(true);
    }
  }

  setTempRecordingInfo(tempRecordingInfo: ITempRecordingInfo) {
    this.SET_TEMP_RECORDING_INFO(tempRecordingInfo);
  }

  // =================================================================================================
  // UPLOAD logic
  // =================================================================================================

  getUploadInfo(uploadInfo: IUploadInfo[], platform: EUploadPlatform): IUploadInfo | undefined {
    return uploadInfo.find(u => u.platform === platform);
  }

  cancelFunction: (() => void) | null = null;
  /**
   * Will cancel the currently in progress upload
   */
  cancelUpload(platform: EUploadPlatform) {
    if (
      this.cancelFunction &&
      this.views.uploadInfo.find(u => u.platform === platform && u.uploading)
    ) {
      this.SET_UPLOAD_INFO({ cancelRequested: true, platform });
      this.cancelFunction();
    }
  }

  clearUpload() {
    this.CLEAR_UPLOAD();
  }

  async uploadYoutube(options: IYoutubeVideoUploadOptions) {
    if (!this.userService.state.auth?.platforms.youtube) {
      throw new Error('Cannot upload without YT linked');
    }

    if (!this.views.exportInfo.exported) {
      throw new Error('Cannot upload when export is not complete');
    }

    if (this.views.uploadInfo.some(u => u.uploading)) {
      throw new Error('Cannot start a new upload when uploading is in progress');
    }

    this.SET_UPLOAD_INFO({
      platform: EUploadPlatform.YOUTUBE,
      uploading: true,
      cancelRequested: false,
      error: false,
    });

    const yt = getPlatformService('youtube') as YoutubeService;

    const { cancel, complete } = yt.uploader.uploadVideo(
      this.views.exportInfo.file,
      options,
      progress => {
        this.SET_UPLOAD_INFO({
          platform: EUploadPlatform.YOUTUBE,
          uploadedBytes: progress.uploadedBytes,
          totalBytes: progress.totalBytes,
        });
      },
    );

    this.cancelFunction = cancel;
    let result: IYoutubeUploadResponse | null = null;

    try {
      result = await complete;
    } catch (e: unknown) {
      if (this.views.uploadInfo.some(u => u.cancelRequested)) {
        console.log('The upload was canceled');
      } else {
        Sentry.withScope(scope => {
          scope.setTag('feature', 'highlighter');
          console.error('Got error uploading YT video', e);
        });

        this.SET_UPLOAD_INFO({ platform: EUploadPlatform.YOUTUBE, error: true });
        this.usageStatisticsService.recordAnalyticsEvent(
          this.views.useAiHighlighter ? 'AIHighlighter' : 'Highlighter',
          {
            type: 'UploadYouTubeError',
          },
        );
      }
    }

    this.cancelFunction = null;
    this.SET_UPLOAD_INFO({
      platform: EUploadPlatform.YOUTUBE,
      uploading: false,
      cancelRequested: false,
      videoId: result ? result.id : null,
    });

    if (result) {
      this.usageStatisticsService.recordAnalyticsEvent(
        this.views.useAiHighlighter ? 'AIHighlighter' : 'Highlighter',
        {
          type: 'UploadYouTubeSuccess',
          privacy: options.privacyStatus,
          videoLink:
            options.privacyStatus === 'public'
              ? `https://youtube.com/watch?v=${result.id}`
              : undefined,
        },
      );
    }
  }

  async uploadStorage(platform: EUploadPlatform) {
    this.SET_UPLOAD_INFO({ platform, uploading: true, cancelRequested: false, error: false });

    const { cancel, complete, size } = await this.sharedStorageService.actions.return.uploadFile(
      this.views.exportInfo.file,
      progress => {
        this.SET_UPLOAD_INFO({
          platform,
          uploadedBytes: progress.uploadedBytes,
          totalBytes: progress.totalBytes,
        });
      },
      error => {
        this.SET_UPLOAD_INFO({ platform, error: true });
        console.error(error);
      },
    );
    this.cancelFunction = cancel;
    let id;
    try {
      const result = await complete;
      id = result.id;
    } catch (e: unknown) {
      if (this.views.uploadInfo.some(u => u.cancelRequested)) {
        console.log('The upload was canceled');
      } else {
        this.SET_UPLOAD_INFO({ platform, uploading: false, error: true });
        this.usageStatisticsService.recordAnalyticsEvent('Highlighter', {
          type: 'UploadStorageError',
          fileSize: size,
          platform,
        });
      }
    }
    this.cancelFunction = null;
    this.SET_UPLOAD_INFO({
      platform,
      uploading: false,
      cancelRequested: false,
      videoId: id || null,
    });

    if (id) {
      this.usageStatisticsService.recordAnalyticsEvent('Highlighter', {
        type: 'UploadStorageSuccess',
        fileSize: size,
        platform,
      });
    }

    return id;
  }

  /**
   * Utility function that returns a promise that resolves after a specified delay
   * @param ms Delay in milliseconds
   * @returns Promise that resolves after the delay
   */
  wait(ms: number): Promise<void> {
    return new Promise<void>(resolve => setTimeout(resolve, ms));
  }
}
