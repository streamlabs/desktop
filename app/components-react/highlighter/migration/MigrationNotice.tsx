import React, { useEffect, useState } from 'react';
import { Button } from 'antd';
import styles from '../MigrationNotice.m.less';
import cx from 'classnames';
import { Services } from 'components-react/service-provider';
import Utils from 'services/utils';
import InstallationFlow from './InstallationFlow';
import SectionHeader from './SectionHeader';
import { useVuex } from 'components-react/hooks';
import { EAvailableFeatures } from 'services/incremental-rollout';
import { REPLAY_APP_NAME } from 'services/highlighter/constants';
import { $t } from 'services/i18n';

interface IMigrationNoticeProps {
  variant?: 'page' | 'modal';
  onShowAllClips?: () => void;
  onOpenReplay?: () => void;
  onCancel?: () => void;
  onInstallComplete?: () => void;
}

export default function MigrationNotice(props: IMigrationNoticeProps) {
  const { HighlighterService, IncrementalRolloutService } = Services;
  const [isReplayInstalled, setIsReplayInstalled] = useState<boolean | null>(null);
  const [isRecorderRunning, setIsRecorderRunning] = useState<boolean>(false);
  const variant = props.variant || 'page';
  const isModal = variant === 'modal';

  const installStep = useVuex(() => HighlighterService.state.replayInstall.step);
  const isInstalling = installStep !== 'idle' && installStep !== 'done';

  // Check if migration notice feature is enabled
  const isMigrationEnabled = IncrementalRolloutService.views.featureIsEnabled(
    EAvailableFeatures.highlighterMigration,
  );

  useEffect(() => {
    checkReplayInstallation();
  }, []);

  useEffect(() => {
    if (installStep === 'done') {
      setIsReplayInstalled(true);
      if (props.onInstallComplete) {
        props.onInstallComplete();
      }
    }
  }, [installStep]);

  async function checkReplayInstallation() {
    const installed = await HighlighterService.actions.return.isStreamlabsReplayInstalled();
    setIsReplayInstalled(installed);

    // If Replay is installed, check if the recorder is running
    if (installed) {
      const recorderRunning = await HighlighterService.actions.return.isStreamlabsRecorderRunning();
      setIsRecorderRunning(recorderRunning);
    }
  }

  async function handleOpenReplay() {
    // Use the service method to handle opening/installing Replay
    const isReplayInstalled = await HighlighterService.actions.return.openReplay(variant);

    if (props.onOpenReplay) {
      props.onOpenReplay();
    }
  }

  function handleInstallCancel() {
    if (props.onCancel) {
      props.onCancel();
    }
  }

  // If feature is not enabled, don't render anything (dev mode is handled in featureIsEnabled)
  if (!isMigrationEnabled) {
    return null;
  }

  // Show installation flow when installing
  if (isInstalling) {
    return <InstallationFlow variant={variant} onCancel={handleInstallCancel} />;
  }

  // If Replay is installed and the recorder is running, show a simple message
  if (isReplayInstalled && isRecorderRunning) {
    return (
      <div className={cx(styles.migrationNotice, isModal && styles.migrationNoticeModal)}>
        <div className={styles.content}>
          <SectionHeader title={$t(`${REPLAY_APP_NAME} is active`)} onClose={props.onCancel} />
          <p className={styles.subtitle}>
            {$t(
              `The ${REPLAY_APP_NAME} recorder is currently running and capturing your gameplay.`,
            )}
          </p>
        </div>
      </div>
    );
  }

  if (isModal) {
    return (
      <div className={styles.migrationNoticeModal}>
        <SectionHeader title={$t(`${REPLAY_APP_NAME} is required`)} onClose={props.onCancel} />
        <p className={styles.subtitle}>
          {$t(`Install ${REPLAY_APP_NAME} to import and detect game highlights.`)}
        </p>
        <div className={styles.actions}>
          <Button size="large" onClick={handleOpenReplay} style={{ width: '100%' }}>
            {isReplayInstalled ? $t(`Open ${REPLAY_APP_NAME}`) : $t(`Install ${REPLAY_APP_NAME}`)}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={cx(styles.migrationNotice)}>
      <SectionHeader
        title={$t(`AI Highlighter is now ${REPLAY_APP_NAME}`)}
        onClose={props.onCancel}
      />
      <p className={styles.subtitle}>
        {$t(`Your recent AI highlights are now living in ${REPLAY_APP_NAME}.`)}
      </p>
      <div className={styles.actions}>
        <Button size="large" onClick={handleOpenReplay} style={{ width: '100%' }}>
          {isReplayInstalled ? $t(`Open ${REPLAY_APP_NAME}`) : $t(`Install ${REPLAY_APP_NAME}`)}
        </Button>
        {props.onShowAllClips && (
          <Button size="large" onClick={props.onShowAllClips}>
            {$t('Show all clips')}
          </Button>
        )}
      </div>
    </div>
  );
}
