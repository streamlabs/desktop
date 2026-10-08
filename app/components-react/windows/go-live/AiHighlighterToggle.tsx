import { SwitchInput } from 'components-react/shared/inputs/SwitchInput';
import React, { useEffect, useState } from 'react';
import styles from './AiHighlighterToggle.m.less';
import { Services } from 'components-react/service-provider';
import { useDebounce, useIsMounted, useVuex } from 'components-react/hooks';
import { DownOutlined, UpOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { isGameSupported } from 'services/highlighter/models/game-config.models';
import { TInstalledHighlighterApp } from 'services/highlighter/models/highlighter.models';
import { $t } from 'services/i18n';
import { GO_LIVE_HIGHLIGHTER_GRAPHIC, REPLAY_APP_NAME } from 'services/highlighter/constants';
import { promptAction } from 'components-react/modals';
import { EDismissable } from 'services/dismissables';

export default function AiHighlighterToggle({ isUpdateMode }: { isUpdateMode?: boolean }) {
  const { HighlighterService, StreamingService, DismissablesService } = Services;
  const {
    useHighlighter,
    isVerticalRecording,
    isVerticalReplayBuffer,
    outputDisplay,
    gameName,
    shouldShow,
  } = useVuex(() => {
    return {
      useHighlighter: HighlighterService.views.useAiHighlighter,
      isVerticalRecording: StreamingService.views.isVerticalRecording,
      isVerticalReplayBuffer: StreamingService.views.isVerticalReplayBuffer,
      outputDisplay: StreamingService.views.outputDisplay,
      gameName: StreamingService.views.gameName,
      shouldShow: DismissablesService.views.shouldShow(EDismissable.HighlighterBanner),
    };
  });

  const [installedApp, setInstalledApp] = useState<TInstalledHighlighterApp | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showReplayRecordingAlert, setShowReplayRecordingAlert] = useState(false);
  const disableAIHighlighter =
    (isVerticalRecording || isVerticalReplayBuffer) && outputDisplay === 'vertical';
  const gameIsSupported = !!isGameSupported(gameName);

  // The install itself happens after the stream, so the button only opts the user in. Once they
  // are opted in, or already have an app, the card collapses to the toggle.
  const showToggle = useHighlighter || (installedApp !== null && installedApp !== 'none');

  useEffect(() => {
    HighlighterService.actions.return.getInstalledHighlighterApp().then(setInstalledApp);
    checkRecorderStatus();
  }, []);

  useEffect(() => {
    if (installedApp === null) return;
    setIsExpanded(!showToggle && !isUpdateMode);
  }, [showToggle, installedApp]);

  const isMounted = useIsMounted();
  async function checkRecorderStatus() {
    const running = await HighlighterService.actions.return.isStreamlabsRecorderRunning();
    if (!isMounted.current) return;
    setShowReplayRecordingAlert(running);
  }

  async function handleStopRecording() {
    try {
      HighlighterService.actions.requestStopRecordingReplay();
      // Hide the warning alert
      setShowReplayRecordingAlert(false);
      // Recheck recorder status after a short delay
      // Maybe we want to add that back later
      // setTimeout(checkRecorderStatus, 5000);
    } catch (error: unknown) {
      console.error('Failed to send stop recording command:', error);
    }
  }

  const showHighlighterBanner = shouldShow || !isUpdateMode;

  const toggleHighlighter = useDebounce(300, handleToggleHighlighter);

  function handleToggleHighlighter() {
    if (disableAIHighlighter) {
      const title = isVerticalRecording
        ? $t('Vertical Recording Active')
        : $t('Vertical Replay Buffer Active');

      const message = isVerticalRecording
        ? $t(
            'Vertical recording is in-progress. Would you like to stop the recording to enable AI Highlighter?',
          )
        : $t(
            'Vertical replay buffer is active. Would you like to stop the replay buffer to enable AI Highlighter?',
          );

      const btnText = isVerticalRecording ? $t('Stop Recording') : $t('Stop Replay Buffer');

      promptAction({
        title,
        message,
        btnText,
        fn: () => {
          if (isVerticalRecording) {
            StreamingService.actions.toggleRecording();
          } else {
            StreamingService.actions.stopReplayBuffer();
          }
          HighlighterService.actions.toggleAiHighlighter();
        },
        cancelBtnPosition: 'left',
        cancelBtnText: $t('Cancel'),
      });

      return;
    }

    HighlighterService.actions.toggleAiHighlighter();
  }

  function showRecorderWarning() {
    return (
      <div className={styles.recorderWarning}>
        <div
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'start', width: '100%' }}
        >
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>
            {$t('External Streamlabs recorder is running')}
          </div>
          <div style={{ fontSize: '12px', opacity: 0.8 }}>
            {$t('The %{appName} recorder is also capturing gameplay.', {
              appName: REPLAY_APP_NAME,
            })}
          </div>
        </div>
        <Button type="default" style={{ width: '100%' }} onClick={handleStopRecording}>
          {$t('Stop External Recording')}
        </Button>
      </div>
    );
  }

  if (!gameIsSupported || !showHighlighterBanner) return <></>;

  return (
    <div key={'aiSelector'} data-name="ai-highlighter-selector" className={styles.highlighterCard}>
      {showToggle ? (
        <div className={styles.toggleRow}>
          <span className={styles.toggleLabel}>{$t('Get Stream Highlights after stream')}</span>
          <SwitchInput
            name="replay"
            value={disableAIHighlighter ? false : useHighlighter}
            label=""
            onChange={toggleHighlighter}
            layout="horizontal"
            checkmark
            nolabel
          />
        </div>
      ) : (
        <div className={styles.header}>
          <div className={styles.headlineWrapper} onClick={() => setIsExpanded(!isExpanded)}>
            <h3 className={styles.headline}>{$t('Get Stream Highlights')}</h3>
            <p className={styles.subheadline}>
              {$t("Auto-generate highlight reels when you're done streaming")}
            </p>
          </div>
          <div className={styles.actions}>
            <Button className={styles.installButton} onClick={toggleHighlighter}>
              {$t('One-click install')}
            </Button>
            <Button
              className={styles.expandButton}
              onClick={() => setIsExpanded(!isExpanded)}
              icon={isExpanded ? <UpOutlined /> : <DownOutlined />}
            />
          </div>
        </div>
      )}

      {showReplayRecordingAlert && useHighlighter
        ? showRecorderWarning()
        : isExpanded &&
          !showToggle && (
            <img className={styles.graphic} src={GO_LIVE_HIGHLIGHTER_GRAPHIC} alt="" />
          )}

      {isUpdateMode && (
        <div className={styles.dismissable}>
          <a onClick={() => DismissablesService.actions.dismiss(EDismissable.HighlighterBanner)}>
            {$t('Do not ask again')}
          </a>
        </div>
      )}
    </div>
  );
}
