import { useEffect, useState } from 'react';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import { EReplayInstallStep } from 'services/highlighter/models/highlighter.models';
import { REPLAY_APP_NAME } from 'services/highlighter/constants';
import { $t } from 'services/i18n';

export function useInstallState() {
  const { HighlighterService } = Services;

  const [isInstalled, setIsInstalled] = useState<boolean | null>(null);
  const [isRecorderRunning, setIsRecorderRunning] = useState(false);

  const { step, progress, error } = useVuex(() => ({
    step: HighlighterService.state.replayInstall.step as EReplayInstallStep,
    progress: HighlighterService.state.replayInstall.progress as number,
    error: HighlighterService.state.replayInstall.error as string | null,
  }));

  const isInstalling = step === 'downloading' || step === 'installing' || step === 'verifying';

  useEffect(() => {
    HighlighterService.actions.return.isStreamlabsReplayInstalled().then(installed => {
      setIsInstalled(installed);
      if (installed) {
        HighlighterService.actions.return.isStreamlabsRecorderRunning().then(setIsRecorderRunning);
      }
    });
  }, []);

  useEffect(() => {
    if (step === 'done') setIsInstalled(true);
  }, [step]);

  function handleOpenOrInstall(source: 'page' | 'modal') {
    HighlighterService.actions.openReplay(source);
  }

  function handleRetry() {
    HighlighterService.actions.installStreamlabsReplay();
  }

  function handleCancel() {
    HighlighterService.actions.cancelReplayInstall();
  }

  return {
    step,
    progress,
    error,
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
