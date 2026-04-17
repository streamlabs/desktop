import React from 'react';
import { Button } from 'antd';
import cx from 'classnames';
import styles from '../MigrationNotice.m.less';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import { EReplayInstallStep } from 'services/highlighter/models/highlighter.models';
import { REPLAY_APP_NAME } from 'services/highlighter/constants';
import { $t } from 'services/i18n';
import SectionHeader from './SectionHeader';

interface IInstallationFlowProps {
  onCancel: () => void;
  variant: 'modal' | 'page';
}

export default function InstallationFlow(props: IInstallationFlowProps) {
  const { HighlighterService } = Services;

  const { step, progress, error } = useVuex(() => ({
    step: HighlighterService.state.replayInstall.step as EReplayInstallStep,
    progress: HighlighterService.state.replayInstall.progress as number,
    error: HighlighterService.state.replayInstall.error as string | null,
  }));

  function handleRetry() {
    HighlighterService.actions.installStreamlabsReplay();
  }

  function handleCancel() {
    HighlighterService.actions.cancelReplayInstall();
    props.onCancel();
  }

  if (step === 'done') {
    return (
      <div
        className={cx(
          styles.installationFlow,
          props.variant === 'modal' ? styles.installationFlowModal : styles.installationFlowPage,
        )}
      >
        <SectionHeader title={$t('Installing Highlighter')} onClose={props.onCancel} />
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
      <div
        className={cx(
          styles.installationFlow,
          props.variant === 'modal' ? styles.installationFlowModal : styles.installationFlowPage,
        )}
      >
        <SectionHeader title={$t('Installing Highlighter')} onClose={handleCancel} />
        <div className={styles.installContent}>
          <div className={styles.errorTitle}>{$t('Installation interrupted')}</div>
          <p className={styles.installSubtext}>
            {$t("It seems the installation didn't finish.")}
            <br />
            {$t("Let's figure this out together and")}{' '}
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
          <Button size="large" className={styles.retryButton} onClick={handleRetry}>
            {$t('Re-try installation')}
          </Button>
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
    <div
      className={cx(
        styles.installationFlow,
        props.variant === 'modal' ? styles.installationFlowModal : styles.installationFlowPage,
      )}
    >
      <SectionHeader
        title={$t('Installing Highlighter')}
        onClose={handleCancel}
        closeDisabled={step !== 'downloading'}
      />
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
      <div className={styles.installActions}>
        <Button
          size="large"
          className={styles.cancelInstallButton}
          onClick={handleCancel}
          disabled={step !== 'downloading'}
        >
          {$t('Cancel installation')}
        </Button>
      </div>
    </div>
  );
}
