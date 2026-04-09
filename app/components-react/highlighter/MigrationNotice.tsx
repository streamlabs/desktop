import React, { useEffect, useState } from 'react';
import styles from './MigrationNotice.m.less';
import cx from 'classnames';
import { Services } from 'components-react/service-provider';
import Utils from 'services/utils';
import InstallationFlow from './InstallationFlow';
import { useVuex } from 'components-react/hooks';

interface IMigrationNoticeProps {
  variant?: 'page' | 'modal';
  onShowAllClips?: () => void;
  onOpenReplay?: () => void;
  onCancel?: () => void;
  onInstallComplete?: () => void;
}

export default function MigrationNotice(props: IMigrationNoticeProps) {
  const { HighlighterService } = Services;
  const [isReplayInstalled, setIsReplayInstalled] = useState<boolean | null>(null);
  const isDevMode = Utils.isDevMode();
  const variant = props.variant || 'page';

  const installStep = useVuex(() => HighlighterService.state.replayInstall.step);
  const isInstalling = installStep !== 'idle' && installStep !== 'done';

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
    const installed = await HighlighterService.isStreamlabsReplayInstalled();
    console.log('Streamlabs Replay installation check result:', installed);
    setIsReplayInstalled(installed);
  }

  async function handleDeleteRegistry() {
    const success = await HighlighterService.deleteStreamlabsReplayRegistry();
    if (success) {
      console.log('Registry deleted, rechecking installation status...');
      await checkReplayInstallation();
    }
  }

  async function handleOpenReplay() {
    // Use the service method to handle opening/installing Replay
    const isReplayInstalled = await HighlighterService.openReplay(variant);
    console.log('Opening Streamlabs Replay, isInstalled:', isReplayInstalled);

    if (props.onOpenReplay) {
      props.onOpenReplay();
    }
  }

  function handleInstallCancel() {
    if (props.onCancel) {
      props.onCancel();
    }
  }

  // Show installation flow when installing
  if (isInstalling) {
    return <InstallationFlow onCancel={handleInstallCancel} />;
  }

  const isModal = variant === 'modal';

  return (
    <div className={cx(styles.migrationNotice, isModal && styles.migrationNoticeModal)}>
      <div className={styles.content}>
        <h1 className={cx(styles.title, isModal && styles.titleModal)}>
          {isModal ? 'Streamlabs Replay is required' : 'AI Highlighter is now Streamlabs Replay'}
        </h1>
        <p className={styles.subtitle}>
          {isModal
            ? 'Install Streamlabs Replay to import and detect game highlights.'
            : 'Your recent AI highlights are now living in Streamlabs Replay.'}
        </p>
        <div className={styles.actions}>
          <button className={styles.primaryButton} onClick={handleOpenReplay}>
            {isReplayInstalled ? 'Open Streamlabs Replay' : 'Install Streamlabs Replay'}
          </button>
          {props.onShowAllClips && (
            <button className={styles.secondaryButton} onClick={props.onShowAllClips}>
              Show all clips
            </button>
          )}
          {props.onCancel && !isReplayInstalled && (
            <button className={styles.secondaryButton} onClick={props.onCancel}>
              Cancel
            </button>
          )}
          {isDevMode && (
            <button
              className={styles.secondaryButton}
              onClick={handleDeleteRegistry}
              style={{ marginLeft: '16px', opacity: 0.6 }}
            >
              🗑️ Delete Registry (Dev)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
