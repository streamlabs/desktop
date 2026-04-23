import React from 'react';
import { Button } from 'antd';
import cx from 'classnames';
import { REPLAY_APP_NAME } from 'services/highlighter/constants';
import { $t } from 'services/i18n';
import styles from './MigrationNotice.m.less';
import FeatureCarousel, { CAROUSEL_FEATURES } from './FeatureCarousel';
import { useInstallState, getStatusText } from './useInstallState';
import { EReplayInstallStep } from 'services/highlighter/models/highlighter.models';

interface IPageInstallationFlowProps {
  onCancel: () => void;
  onShowAllClips: () => void;
}

export default function PageInstallationFlow(props: IPageInstallationFlowProps) {
  const {
    step,
    progress,
    isInstalled,
    handleOpenOrInstall,
    handleRetry,
    handleCancel,
  } = useInstallState();

  function onCancel() {
    handleCancel();
    props.onCancel();
  }

  return (
    <FeatureCarousel
      title={$t(`AI Highlighter is now ${REPLAY_APP_NAME}`)}
      description={$t(
        `Supercharge your workflow with our standalone tool ${REPLAY_APP_NAME}. Faster edits, more output in less time. Try it now`,
      )}
      features={CAROUSEL_FEATURES}
    >
      <div style={{ height: 82, display: 'flex', flexDirection: 'column', justifyContent: 'end' }}>
        <PageInstallCta
          step={step}
          progress={progress}
          isInstalled={isInstalled ?? false}
          onOpenOrInstall={() => handleOpenOrInstall('page')}
          onRetry={handleRetry}
          onCancel={onCancel}
          onShowAllClips={props.onShowAllClips}
        />
      </div>
    </FeatureCarousel>
  );
}

// ── Inline install CTA rendered as FeatureCarousel children ──

interface IPageInstallCtaProps {
  step: EReplayInstallStep;
  progress: number;
  isInstalled: boolean;
  onOpenOrInstall: () => void;
  onShowAllClips: () => void;
  onRetry: () => void;
  onCancel: () => void;
}

function PageInstallCta({
  step,
  progress,
  isInstalled,
  onOpenOrInstall,
  onShowAllClips,
  onRetry,
  onCancel,
}: IPageInstallCtaProps) {
  const isInstalling = step === 'downloading' || step === 'installing' || step === 'verifying';

  // Idle — CTA button (install or open depending on whether Replay is already installed)
  if (step === 'idle') {
    return (
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ position: 'relative' }}>
          {!isInstalled && (
            <div style={{ position: 'absolute', left: 63, top: -32 }}>
              <svg
                width="25"
                height="28"
                viewBox="0 0 25 28"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M0.999981 4.42494C1.90239 4.16276 4.27213 3.66526 5.56422 3.9363C6.88805 4.214 7.98602 5.59319 8.91067 7.68165C9.35877 8.69375 9.6488 10.5263 9.74012 11.5392C9.83143 12.5522 9.5569 12.7454 8.95352 13.0876C7.44303 13.9444 6.21482 14.4736 5.76129 14.4591C5.33256 14.4454 5.21542 13.5403 5.11641 12.7188C5.06957 12.3302 5.24923 11.9852 5.42348 11.7162C6.55413 9.97064 10.3417 10.0204 11.9438 10.0858C13.9418 10.1675 16.5147 12.3687 18.0894 13.8142C18.5018 14.3521 19.0604 15.2699 19.6139 16.3704C19.8296 16.8552 19.9128 17.1904 19.9985 17.5357"
                  stroke="var(--teal)"
                  stroke-width="2"
                  stroke-linecap="round"
                />
                <path
                  d="M22.7646 16.0186C22.8017 16.2727 22.7116 18.6837 22.7228 20.385C22.7292 21.3628 22.4415 22.303 22.0821 23.1059C21.7072 23.9433 20.4456 21.5571 18.3216 20.3302C17.4227 19.9399 16.6705 19.552 16.0092 19.1073C15.7181 18.9076 15.5176 18.7606 15.2752 18.5885"
                  stroke="var(--teal)"
                  stroke-width="2"
                  stroke-linecap="round"
                />
              </svg>
              <span
                style={{
                  position: 'absolute',
                  width: 70,
                  left: -82,
                  top: -7,
                  transform: 'rotate(-3deg)',
                  textAlign: 'end',
                }}
                className={styles.handwrittenAnnotations}
              >
                {$t('Try now')}
              </span>
            </div>
          )}

          <Button
            size="large"
            style={{ width: 'max-content' }}
            type="primary"
            onClick={onOpenOrInstall}
          >
            {isInstalled ? $t(`Open ${REPLAY_APP_NAME}`) : $t(`Install ${REPLAY_APP_NAME}`)}
            {!isInstalled && (
              <div
                style={{
                  position: 'absolute',
                  right: -17,
                  transform: 'translateX(100%)',
                }}
              >
                <svg
                  width="21"
                  height="17"
                  viewBox="0 0 21 17"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M16.1185 15.0734C16.3177 14.7159 17.9401 12.1894 18.9712 10.4073C19.1091 10.169 19.0813 9.89995 18.987 9.84488C18.2129 9.39293 17.0191 10.7889 15.2749 11.8505C13.5298 12.9126 12.3563 13.8652 11.9908 13.8837C10.9708 13.9353 12.6581 11.8576 13.4625 10.9318C14.2666 10.0064 14.7412 8.57034 15.2174 7.70889C15.2985 7.56228 14.9855 7.41496 14.7426 7.43846C13.6113 7.54787 12.8649 8.69952 11.6449 9.3928C9.65425 10.524 8.85768 11.0678 8.33975 11.2029C7.23125 11.4922 9.20552 9.31279 9.82127 8.50574C9.9768 8.30189 9.9679 8.01332 9.88802 7.76572C9.53031 6.65695 8.38244 6.04631 7.41312 5.59814C6.45962 5.15729 5.51678 4.57306 4.45154 4.16467C3.47818 3.77698 2.7034 3.5388 2.20281 3.28786C1.9354 3.15367 1.64081 3.00558 1 2.52539"
                    stroke="var(--teal)"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                  <path
                    d="M1 2.52539C1 2.61431 1 3.27648 1.07549 4.64504C1.30194 6.26661 1.53905 7.47418 1.69014 8.08151C1.75967 8.37698 1.81468 8.64662 1.91401 9.26561"
                    stroke="var(--teal)"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                  <path
                    d="M1.0625 2.45389C1.67266 2.45389 3.40657 2.26901 4.45403 1.88326C5.48224 1.67902 6.37813 1.42982 7.142 1.28282C7.48014 1.211 7.71779 1.14479 8.63628 1"
                    stroke="var(--teal)"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                </svg>
                <span
                  style={{ color: 'var(--teal)', paddingLeft: 4 }}
                  className={styles.handwrittenAnnotations}
                >
                  {$t('Timesaver-in-a-box')}
                </span>
              </div>
            )}
          </Button>
        </div>
        {isInstalled && (
          <Button
            size="large"
            style={{ width: 'max-content' }}
            type="default"
            onClick={onShowAllClips}
          >
            {$t('Show clips')}
          </Button>
        )}
      </div>
    );
  }

  // Downloading / Installing / Verifying — progress bar
  if (isInstalling) {
    const statusText = getStatusText(step);

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
        <Button style={{ width: 'max-content' }} type="primary" onClick={onOpenOrInstall}>
          {$t(`Open ${REPLAY_APP_NAME}`)}
        </Button>
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
