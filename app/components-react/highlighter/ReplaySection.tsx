import React, { useEffect, useState } from 'react';
import { Button } from 'antd';
import cx from 'classnames';
import * as remote from '@electron/remote';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import { SwitchInput } from 'components-react/shared/inputs';
import { promptAction } from 'components-react/modals';
import {
  HIGHLIGHTER_APP_NAME,
  REPLAY_APP_NAME,
  REPLAY_IMAGE_PATH,
} from 'services/highlighter/constants';
import { $t } from 'services/i18n';
import Utils from 'services/utils';
import { useInstallState, getStatusText } from './useInstallState';
import styles from './ReplaySection.m.less';

// Titles are translation keys, translated at render time
const FEATURE_STEPS = [
  {
    id: 'record',
    title: 'Stream or record',
    subtitle: 'Manually or automatically',
    image: `${REPLAY_IMAGE_PATH}/auto-record.webp`,
  },
  {
    id: 'highlights',
    title: 'Get Highlights',
    subtitle: 'As ready to share reels',
    image: `${REPLAY_IMAGE_PATH}/create.webp`,
  },
  {
    id: 'subtitles',
    title: 'Add subtitles',
    subtitle: 'Automatically',
    image: `${REPLAY_IMAGE_PATH}/subtitles.webp`,
  },
  {
    id: 'grow',
    title: 'Grow everywhere',
    subtitle: 'Share to all platforms',
    image: `${REPLAY_IMAGE_PATH}/grow.webp`,
  },
];

// "Get Highlights" is what Replay is about, so its image is the one shown first
const DEFAULT_STEP = 1;
const STEP_INTERVAL_MS = 5000;

/**
 * Top of the Highlighter page. Installs Replay when neither app is installed, otherwise opens
 * whichever app the user has and offers importing a recording into it. Below that, clickable
 * feature steps switch the hero image.
 */
export default function ReplaySection({ onImport }: { onImport: () => void }) {
  const {
    step,
    progress,
    installedApp,
    handleOpenOrInstall,
    handleRetry,
    handleCancel,
  } = useInstallState();

  // Once the installer finished, Replay is installed even before a fresh registry lookup
  const hasApp = step === 'done' || (installedApp !== null && installedApp !== 'none');
  const appName = installedApp === 'highlighter' ? HIGHLIGHTER_APP_NAME : REPLAY_APP_NAME;
  const isInstalling = step === 'downloading' || step === 'installing' || step === 'verifying';
  const isStaging = Utils.getHighlighterEnvironment() !== 'production';
  const [activeStep, setActiveStep] = useState(DEFAULT_STEP);
  const [stepsHovered, setStepsHovered] = useState(false);

  // Advance to the next step on a timer. Keyed on the active step, so a click restarts the
  // countdown; paused while the user hovers the steps to read them.
  useEffect(() => {
    if (stepsHovered) return;
    const timeout = setTimeout(
      () => setActiveStep(index => (index + 1) % FEATURE_STEPS.length),
      STEP_INTERVAL_MS,
    );
    return () => clearTimeout(timeout);
  }, [activeStep, stepsHovered]);

  function renderActions() {
    // Registry lookup still pending: keep the space so the page does not jump
    if (installedApp === null) return null;

    if (isInstalling) {
      return <InstallProgress step={step} progress={progress} onCancel={handleCancel} />;
    }

    if (step === 'error') return <InstallError onRetry={handleRetry} />;

    if (hasApp) {
      return (
        <>
          <Button
            size="large"
            type="primary"
            className={styles.primaryCta}
            onClick={() => handleOpenOrInstall('page')}
          >
            {$t('Open %{appName}', { appName })}
          </Button>
          <Button size="large" className={styles.importButton} onClick={onImport}>
            {$t('Import recording')}
          </Button>
          {/* <AutoHighlightToggle /> */}
        </>
      );
    }

    return (
      <>
        <Button
          size="large"
          type="primary"
          className={styles.primaryCta}
          onClick={() => handleOpenOrInstall('page')}
        >
          {$t('One-click-install')}
        </Button>
        {/* <span className={styles.fileSize}>
          {$t('%{size}MB filesize', { size: REPLAY_SETUP_SIZE_MB })}
        </span> */}
      </>
    );
  }

  return (
    <section className={styles.replaySection}>
      <div className={styles.hero}>
        <div className={styles.heroText}>
          <h1 className={styles.headline}>
            {$t('Share your best clips.')}
            <br />
            <span className={styles.headlineAccent}>{$t('Automatically.')}</span>
          </h1>
          <p className={styles.description}>
            {hasApp
              ? $t(
                  '%{appName} captures the best moments from your streams and turns them into clips ready to share - automatically',
                  { appName },
                )
              : $t(
                  'Install %{appName} and capture the best moments from your streams and turn them into ready to share clips - automatically',
                  { appName: REPLAY_APP_NAME },
                )}
          </p>
          <div className={styles.actions} data-name="streamlabs-highlighter">
            {renderActions()}
          </div>
          {isStaging && <div className={styles.stagingBadge}>STAGING</div>}
        </div>
        {/* All images stay mounted and crossfade, so switching steps never waits on a download */}
        <div className={styles.heroMedia}>
          {FEATURE_STEPS.map((feature, index) => (
            <img
              key={feature.id}
              className={cx(styles.heroImage, { [styles.heroImageActive]: index === activeStep })}
              src={feature.image}
              alt=""
            />
          ))}
        </div>
      </div>

      <FeatureSteps
        activeIndex={activeStep}
        onSelect={setActiveStep}
        onHoverChange={setStepsHovered}
      />
    </section>
  );
}

function AutoHighlightToggle() {
  const { HighlighterService, StreamingService } = Services;
  const v = useVuex(() => ({
    useAiHighlighter: HighlighterService.views.useAiHighlighter,
    isVerticalRecording: StreamingService.views.isVerticalRecording,
    isVerticalReplayBuffer: StreamingService.views.isVerticalReplayBuffer,
    outputDisplay: StreamingService.views.outputDisplay,
  }));

  // Highlights are recorded from the horizontal output, which a vertical recording or replay
  // buffer already occupies
  const blockedByVerticalOutput =
    (v.isVerticalRecording || v.isVerticalReplayBuffer) && v.outputDisplay === 'vertical';

  function toggle() {
    if (!blockedByVerticalOutput) {
      HighlighterService.actions.toggleAiHighlighter();
      return;
    }

    promptAction({
      title: v.isVerticalRecording
        ? $t('Vertical Recording Active')
        : $t('Vertical Replay Buffer Active'),
      message: v.isVerticalRecording
        ? $t(
            'Vertical recording is in-progress. Would you like to stop the recording to enable AI Highlighter?',
          )
        : $t(
            'Vertical replay buffer is active. Would you like to stop the replay buffer to enable AI Highlighter?',
          ),
      btnText: v.isVerticalRecording ? $t('Stop Recording') : $t('Stop Replay Buffer'),
      fn: () => {
        if (v.isVerticalRecording) {
          StreamingService.actions.toggleRecording();
        } else {
          StreamingService.actions.stopReplayBuffer();
        }
        HighlighterService.actions.toggleAiHighlighter();
      },
      cancelBtnPosition: 'left',
      cancelBtnText: $t('Cancel'),
    });
  }

  return (
    <div className={styles.autoHighlight}>
      <span>{$t('Auto Highlight streams')}</span>
      <SwitchInput
        name="useHighlighter"
        nolabel
        style={{ margin: 0 }}
        size="default"
        value={blockedByVerticalOutput ? false : v.useAiHighlighter}
        onChange={toggle}
      />
    </div>
  );
}

function InstallProgress({
  step,
  progress,
  onCancel,
}: {
  step: ReturnType<typeof useInstallState>['step'];
  progress: number;
  onCancel: () => void;
}) {
  const isDownloading = step === 'downloading';

  return (
    <div className={styles.progress}>
      <span className={styles.progressStatus}>{getStatusText(step)}</span>
      <div className={styles.progressRow}>
        <div className={styles.progressTrack}>
          <div
            className={cx(styles.progressFill, { [styles.progressFillPulse]: !isDownloading })}
            style={{ width: isDownloading ? `${progress}%` : '100%' }}
          />
        </div>
        {isDownloading && (
          <>
            <span className={styles.progressPercent}>{Math.round(progress)}%</span>
            <button className={styles.cancelButton} onClick={onCancel}>
              ✕
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function InstallError({ onRetry }: { onRetry: () => void }) {
  function openSupport(e: React.MouseEvent) {
    e.preventDefault();
    remote.shell.openExternal('https://support.streamlabs.com');
  }

  return (
    <div className={styles.error}>
      <span className={styles.errorTitle}>{$t('Installation interrupted')}</span>
      <span className={styles.errorText}>
        {$t("It seems the installation didn't finish.")} {$t("Let's figure this out together and")}{' '}
        <a href="https://support.streamlabs.com" onClick={openSupport}>
          {$t('contact support')}
        </a>
      </span>
      <Button type="primary" onClick={onRetry}>
        {$t('Re-try installation')}
      </Button>
    </div>
  );
}

function FeatureSteps({
  activeIndex,
  onSelect,
  onHoverChange,
}: {
  activeIndex: number;
  onSelect: (index: number) => void;
  onHoverChange: (hovered: boolean) => void;
}) {
  return (
    <div
      className={styles.steps}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
    >
      {FEATURE_STEPS.map((step, index) => (
        <React.Fragment key={step.id}>
          {index > 0 && <div className={styles.stepConnector} />}
          <button
            className={cx(styles.step, { [styles.stepActive]: index === activeIndex })}
            aria-pressed={index === activeIndex}
            onClick={() => onSelect(index)}
          >
            <span className={styles.stepNumber}>{index + 1}</span>
            <span className={styles.stepText}>
              <span className={styles.stepTitle}>{$t(step.title)}</span>
              <span className={styles.stepSubtitle}>{$t(step.subtitle)}</span>
            </span>
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}
