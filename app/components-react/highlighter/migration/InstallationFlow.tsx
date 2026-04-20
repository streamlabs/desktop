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
import FeatureCarousel, { CAROUSEL_FEATURES } from './FeatureCarousel';

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

  function handleInstall() {
    HighlighterService.actions.installStreamlabsReplay();
  }

  function handleRetry() {
    HighlighterService.actions.installStreamlabsReplay();
  }

  function handleCancel() {
    HighlighterService.actions.cancelReplayInstall();
    props.onCancel();
  }

  // ── Page variant: render inside FeatureCarousel ──
  if (props.variant === 'page') {
    return (
      <FeatureCarousel
        title={$t(`AI Highlighter is now ${REPLAY_APP_NAME}`)}
        subtitle={$t('Similar name, but way better!')}
        description={$t(
          'Supercharge your workflow with our standalone tool %{appName}. Faster edits, more output in less time. Try it now',
          { appName: REPLAY_APP_NAME },
        )}
        features={CAROUSEL_FEATURES}
      >
        <div
          style={{ height: 82, display: 'flex', flexDirection: 'column', justifyContent: 'end' }}
        >
          <PageInstallCta
            step={step}
            progress={progress}
            onInstall={handleInstall}
            onRetry={handleRetry}
            onCancel={handleCancel}
          />
        </div>
      </FeatureCarousel>
    );
  }

  // ── Modal variant: unchanged ──
  if (step === 'done') {
    return (
      <div className={cx(styles.installationFlow, styles.installationFlowModal)}>
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
      <div className={cx(styles.installationFlow, styles.installationFlowModal)}>
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
    <div className={cx(styles.installationFlow, styles.installationFlowModal)}>
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
        <button
          className={styles.cancelInstallButton}
          onClick={handleCancel}
          disabled={step !== 'downloading'}
        >
          {$t('Cancel installation')}
        </button>
      </div>
    </div>
  );
}

// ── Inline install CTA rendered as FeatureCarousel children (page variant) ──

interface IPageInstallCtaProps {
  step: EReplayInstallStep;
  progress: number;
  onInstall: () => void;
  onRetry: () => void;
  onCancel: () => void;
}

function PageInstallCta({ step, progress, onInstall, onRetry, onCancel }: IPageInstallCtaProps) {
  const isInstalling = step === 'downloading' || step === 'installing' || step === 'verifying';

  // Idle — CTA button
  if (step === 'idle') {
    return (
      <>
        <Button size="large" style={{ width: 'max-content' }} type="primary" onClick={onInstall}>
          {$t(`Install ${REPLAY_APP_NAME}`)}
        </Button>
      </>
    );
  }

  // Downloading / Installing / Verifying — progress bar
  if (isInstalling) {
    let statusText = $t(`Downloading ${REPLAY_APP_NAME}...`);
    if (step === 'installing') statusText = $t(`Installing ${REPLAY_APP_NAME}...`);
    else if (step === 'verifying') statusText = $t('Verifying installation...');

    return (
      <div className={styles.progressWrapper}>
        <div className={styles.progressLeft}>
          <span className={styles.progressStatus}>{statusText}</span>
          <div className={styles.progressBarRow}>
            <div className={styles.progressTrack}>
              <div
                className={cx(
                  styles.progressFill,
                  step !== 'downloading' && styles.progressFillPulse,
                )}
                style={{ width: step === 'downloading' ? `${progress}%` : '100%' }}
              />
            </div>
            {step === 'downloading' && (
              <button className={styles.cancelX} onClick={onCancel}>
                ✕
              </button>
            )}
          </div>
        </div>
        {step === 'downloading' && (
          <span className={styles.progressPctLarge}>{Math.round(progress)}%</span>
        )}
      </div>
    );
  }

  // Done
  if (step === 'done') {
    return (
      <div className={styles.carouselDone}>
        <span className={styles.carouselDoneTitle}>{$t('Installation finished')}</span>
        <span className={styles.carouselDoneSub}>
          {$t(`${REPLAY_APP_NAME} has been installed and is now running.`)}
        </span>
      </div>
    );
  }

  // Error
  if (step === 'error') {
    return (
      <div className={styles.carouselError}>
        <span className={styles.carouselErrorTitle}>{$t('Installation interrupted')}</span>
        <span className={styles.carouselErrorSub}>
          {$t("It seems the installation didn't finish.")}{' '}
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
        </span>
        <Button style={{ width: 'max-content' }} type="primary" onClick={onRetry}>
          {$t('Re-try installation')}
        </Button>
      </div>
    );
  }

  return null;
}
