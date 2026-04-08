import React from 'react';
import styles from './MigrationNotice.m.less';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import { EReplayInstallStep } from 'services/highlighter/models/highlighter.models';

interface IInstallationFlowProps {
  onCancel: () => void;
}

export default function InstallationFlow(props: IInstallationFlowProps) {
  const { HighlighterService } = Services;

  const { step, progress, error } = useVuex(() => ({
    step: HighlighterService.state.replayInstall.step as EReplayInstallStep,
    progress: HighlighterService.state.replayInstall.progress as number,
    error: HighlighterService.state.replayInstall.error as string | null,
  }));

  function handleRetry() {
    HighlighterService.installStreamlabsReplay();
  }

  function handleCancel() {
    HighlighterService.cancelReplayInstall();
    props.onCancel();
  }

  if (step === 'done') {
    return (
      <div className={styles.installationFlow}>
        <h2 className={styles.installTitle}>Installing Replay</h2>
        <div className={styles.installContent}>
          <div className={styles.successTitle}>Installation finished</div>
          <p className={styles.installSubtext}>
            Streamlabs Replay has been installed and is now running.
          </p>
        </div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className={styles.installationFlow}>
        <h2 className={styles.installTitle}>Installing Replay</h2>
        <div className={styles.installContent}>
          <div className={styles.errorTitle}>Installation interrupted</div>
          <p className={styles.installSubtext}>
            It seems the installation didn't finish.
            <br />
            Let's figure this out together and{' '}
            <a
              className={styles.supportLink}
              href="https://support.streamlabs.com"
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => {
                e.preventDefault();
                require('@electron/remote').shell.openExternal('https://support.streamlabs.com');
              }}
            >
              contact support
            </a>
          </p>
        </div>
        <div className={styles.installActions}>
          <button className={styles.retryButton} onClick={handleRetry}>
            Re-try installation
          </button>
        </div>
      </div>
    );
  }

  const displayProgress = Math.round(progress);
  let statusText = 'Downloading Streamlabs Replay...';
  if (step === 'installing') {
    statusText = 'Installing Streamlabs Replay...';
  } else if (step === 'verifying') {
    statusText = 'Verifying installation...';
  }

  return (
    <div className={styles.installationFlow}>
      <h2 className={styles.installTitle}>Installing Replay</h2>
      <div className={styles.installContent}>
        <div className={styles.progressPercent}>{displayProgress}%</div>
        <p className={styles.installSubtext}>
          {statusText}
          {step === 'downloading' && (
            <>
              <br />
              The installation will start automatically
            </>
          )}
        </p>
      </div>
      {step === 'downloading' && (
        <div className={styles.installActions}>
          <button className={styles.cancelInstallButton} onClick={handleCancel}>
            Cancel installation
          </button>
        </div>
      )}
    </div>
  );
}
