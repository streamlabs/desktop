import React from 'react';
import styles from './MigrationNotice.m.less';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import { EReplayInstallStep } from 'services/highlighter/models/highlighter.models';
import { REPLAY_APP_NAME } from 'services/highlighter/constants';
import { $t } from 'services/i18n';

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
        <h2 className={styles.installTitle}>{$t('Installing Highlighter')}</h2>
        <div className={styles.installContent}>
          <div className={styles.successTitle}>{$t('Installation finished')}</div>
          <p className={styles.installSubtext}>
            {$t(`${REPLAY_APP_NAME} has been installed and is now running.`)}
          </p>
        </div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className={styles.installationFlow}>
        <h2 className={styles.installTitle}>{$t('Installing Highlighter')}</h2>
        <div className={styles.installContent}>
          <div className={styles.errorTitle}>{$t('Installation interrupted')}</div>
          <p className={styles.installSubtext}>
            {$t("It seems the installation didn't finish.")}
            <br />
            {$t('Let\'s figure this out together and')}{' '}
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
              {$t('contact support')}
            </a>
          </p>
        </div>
        <div className={styles.installActions}>
          <button className={styles.retryButton} onClick={handleRetry}>
            {$t('Re-try installation')}
          </button>
        </div>
      </div>
    );
  }

  const displayProgress = Math.round(progress);
  let statusText = $t(`Downloading ${REPLAY_APP_NAME}...`);
  if (step === 'installing') {
    statusText = $t(`Installing ${REPLAY_APP_NAME}...`);
  } else if (step === 'verifying') {
    statusText = $t('Verifying installation...');
  }

  return (
    <div className={styles.installationFlow}>
      <h2 className={styles.installTitle}>{$t('Installing Highlighter')}</h2>
      <div className={styles.installContent}>
        <div className={styles.progressPercent}>{displayProgress}%</div>
        <p className={styles.installSubtext}>
          {statusText}
          {step === 'downloading' && (
            <>
              <br />
              {$t('The installation will start automatically')}
            </>
          )}
        </p>
      </div>
      {step === 'downloading' && (
        <div className={styles.installActions}>
          <button className={styles.cancelInstallButton} onClick={handleCancel}>
            {$t('Cancel installation')}
          </button>
        </div>
      )}
    </div>
  );
}
