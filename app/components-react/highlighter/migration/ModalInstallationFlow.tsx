import React, { useEffect } from 'react';
import { Button } from 'antd';
import cx from 'classnames';
import styles from './MigrationNotice.m.less';
import { REPLAY_APP_NAME } from 'services/highlighter/constants';
import { $t } from 'services/i18n';
import Translate from 'components-react/shared/Translate';
import SectionHeader from './SectionHeader';
import { useInstallState, getStatusText } from './useInstallState';

interface IModalInstallationFlowProps {
  onCancel: () => void;
  onInstallComplete?: () => void;
}

export default function ModalInstallationFlow(props: IModalInstallationFlowProps) {
  const {
    step,
    progress,
    isInstalled,
    isInstalling,
    isRecorderRunning,
    handleOpenOrInstall,
    handleRetry,
    handleCancel,
  } = useInstallState();

  useEffect(() => {
    if (step === 'done' && props.onInstallComplete) {
      props.onInstallComplete();
    }
  }, [step]);

  function onCancel() {
    handleCancel();
    props.onCancel();
  }

  // Idle — show install/open CTA
  if (step === 'idle') {
    // Replay is installed and recorder is running
    if (isInstalled && isRecorderRunning) {
      return (
        <div className={styles.migrationNoticeModal}>
          <SectionHeader
            title={$t('%{appName} is active', { appName: REPLAY_APP_NAME })}
            onClose={props.onCancel}
          />
          <p className={styles.subtitle}>
            {$t('The %{appName} recorder is currently running and capturing your gameplay.', {
              appName: REPLAY_APP_NAME,
            })}
          </p>
        </div>
      );
    }

    return (
      <div className={styles.migrationNoticeModal}>
        <SectionHeader
          title={$t('%{appName} is required', { appName: REPLAY_APP_NAME })}
          onClose={props.onCancel}
        />
        <p className={styles.subtitle}>
          {$t('Install %{appName} to import and detect game highlights.', {
            appName: REPLAY_APP_NAME,
          })}
        </p>
        <div className={styles.actions}>
          <Button
            size="large"
            onClick={() => handleOpenOrInstall('modal')}
            style={{ width: '100%' }}
          >
            {isInstalled
              ? $t('Open %{appName}', { appName: REPLAY_APP_NAME })
              : $t('Install %{appName}', { appName: REPLAY_APP_NAME })}
          </Button>
        </div>
      </div>
    );
  }

  // Done
  if (step === 'done') {
    return (
      <div className={cx(styles.installationFlow, styles.installationFlowModal)}>
        <SectionHeader title={$t('Installing Highlighter')} onClose={props.onCancel} />
        <div className={styles.installContent}>
          <div className={styles.successTitle}>{$t('Installation finished')}</div>
          <p className={styles.installSubtext}>
            {$t('%{appName} has been installed and is now running.', { appName: REPLAY_APP_NAME })}
          </p>
        </div>
      </div>
    );
  }

  // Error
  if (step === 'error') {
    return (
      <div className={cx(styles.installationFlow, styles.installationFlowModal)}>
        <SectionHeader title={$t('Installing Highlighter')} onClose={onCancel} />
        <div className={styles.installContent}>
          <div className={styles.errorTitle}>{$t('Installation interrupted')}</div>
          <p className={styles.installSubtext}>
            <Translate
              message={$t(
                "It seems the installation didn't finish. Let's figure this out together and <support>contact support</support>",
              )}
            >
              <a
                slot="support"
                className={styles.supportLink}
                href="https://support.streamlabs.com"
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault();
                  require('@electron/remote').shell.openExternal('https://support.streamlabs.com');
                }}
              />
            </Translate>
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

  // Downloading / Installing / Verifying — progress bar
  const displayProgress = Math.round(progress);

  return (
    <div className={cx(styles.installationFlow, styles.installationFlowModal)}>
      <SectionHeader
        title={$t('Installing Highlighter')}
        onClose={onCancel}
        closeDisabled={step !== 'downloading'}
      />
      <div className={styles.installContent}>
        <div className={styles.progressPercent}>{displayProgress}%</div>
        <p className={styles.installSubtext}>
          {getStatusText(step)}
          {step === 'downloading' && (
            <>
              <br />
              {$t('The installation will start automatically')}
            </>
          )}
        </p>
      </div>
      <div className={styles.installActions}>
        <button
          className={styles.cancelInstallButton}
          onClick={onCancel}
          disabled={step !== 'downloading'}
        >
          {$t('Cancel installation')}
        </button>
      </div>
    </div>
  );
}
