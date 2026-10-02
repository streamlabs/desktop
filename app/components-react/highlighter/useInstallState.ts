import { useEffect, useState } from 'react';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import {
  EReplayInstallStep,
  IReplayInstallOriginMetadata,
  TInstalledHighlighterApp,
} from 'services/highlighter/models/highlighter.models';
import { REPLAY_APP_NAME } from 'services/highlighter/constants';
import { $t } from 'services/i18n';

/**
 * @param installOriginMetadata - Hand-off data for the install origin marker, passed on again when
 * the user retries a failed install so the retry writes the same marker as the first attempt.
 */
export function useInstallState(installOriginMetadata?: IReplayInstallOriginMetadata) {
  const { HighlighterService } = Services;

  const [installedApp, setInstalledApp] = useState<TInstalledHighlighterApp | null>(null);
  const [isRecorderRunning, setIsRecorderRunning] = useState(false);

  // Kept as the Replay-installed boolean the existing conditionals were written against. A
  // Highlighter user has an app but not this one, so they are deliberately not "installed" here.
  const isInstalled = installedApp === null ? null : installedApp === 'replay';

  const { step, progress, error } = useVuex(() => ({
    step: HighlighterService.state.replayInstall.step as EReplayInstallStep,
    progress: HighlighterService.state.replayInstall.progress as number,
    error: HighlighterService.state.replayInstall.error as string | null,
  }));

  const isInstalling = step === 'downloading' || step === 'installing' || step === 'verifying';

  useEffect(() => {
    HighlighterService.actions.return.getInstalledHighlighterApp().then(app => {
      setInstalledApp(app);
      // The recorder belongs to Replay, so there is nothing to look for in the other two states.
      if (app === 'replay') {
        HighlighterService.actions.return.isStreamlabsRecorderRunning().then(setIsRecorderRunning);
      }
    });
  }, []);

  useEffect(() => {
    if (step === 'done') setInstalledApp('replay');
  }, [step]);

  function handleOpenOrInstall(source: 'page' | 'modal') {
    HighlighterService.actions.openReplay(source);
  }

  function handleRetry() {
    HighlighterService.actions.installStreamlabsReplay(installOriginMetadata);
  }

  function handleCancel() {
    HighlighterService.actions.cancelReplayInstall();
  }

  return {
    step,
    progress,
    error,
    installedApp,
    isInstalled,
    isInstalling,
    isRecorderRunning,
    handleOpenOrInstall,
    handleRetry,
    handleCancel,
  };
}

export function getStatusText(step: EReplayInstallStep): string {
  if (step === 'installing') return $t('Installing %{appName}...', { appName: REPLAY_APP_NAME });
  if (step === 'verifying') return $t('Verifying installation...');
  return $t('Downloading %{appName}...', { appName: REPLAY_APP_NAME });
}
