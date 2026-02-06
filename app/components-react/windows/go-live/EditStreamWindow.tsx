import styles from './GoLive.m.less';
import { ModalLayout } from '../../shared/ModalLayout';
import { Button, Col, Row } from 'antd';
import { useOnCreate } from 'slap';
import { Services } from '../../service-provider';
import React, { useCallback, memo, useEffect, useState } from 'react';
import { $t } from '../../../services/i18n';
import GoLiveChecklist from './GoLiveChecklist';
import Form from '../../shared/inputs/Form';
import Animation from 'rc-animate';
import { useGoLiveSettings, useGoLiveSettingsRoot } from './useGoLiveSettings';
import PlatformSettings from './PlatformSettings';
import Scrollable from '../../shared/Scrollable';
import Spinner from '../../shared/Spinner';
import GoLiveError from './GoLiveError';
import PrimaryChatSwitcher from './PrimaryChatSwitcher';
import { DestinationSwitchers } from './DestinationSwitchers';
import cx from 'classnames';
import { CaretDownOutlined } from '@ant-design/icons';
import Tooltip from 'components-react/shared/Tooltip';
import AutoProgressBar from 'components-react/shared/AutoProgressBar';

export default function EditStreamWindow() {
  const { StreamingService } = Services;
  const {
    lifecycle,
    prepopulate,
    isLoading,
    form,
    enabledPlatforms,
    hasMultiplePlatforms,
    primaryChat,
    setPrimaryChat,
    isDualOutputMode,
    protectedModeEnabled,
    isMidStreamMode,
    cooldownTimer,
  } = useGoLiveSettingsRoot({ isUpdateMode: true });

  const shouldShowChecklist = lifecycle === 'runChecklist';
  const shouldShowSettings = !shouldShowChecklist;

  const shouldShowLeftCol = isDualOutputMode
    ? isMidStreamMode
    : protectedModeEnabled && isMidStreamMode;

  // 5-second countdown timer state
  const [timerSeconds, setTimerSeconds] = useState<number | null>(null);

  useOnCreate(() => {
    // the streamingService still may keep a error from GoLive flow like a "Post a Tweet" error
    // reset error for allowing update channel info
    StreamingService.actions.resetError();
    prepopulate();
  });

  useEffect(() => {
    const subscription = cooldownTimer.subscribe(() => {
      setTimerSeconds(3);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    // 5-second countdown timer for cooldown after adding/removing targets
    if (timerSeconds !== null && timerSeconds > 0) {
      const timer = setTimeout(() => {
        setTimerSeconds(timerSeconds - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else if (timerSeconds === 0) {
      // Clear the timer when it reaches 0
      setTimerSeconds(null);
    }
  }, [timerSeconds]);

  const shouldShowPrimaryChatSwitcher = hasMultiplePlatforms;

  return (
    <ModalLayout footer={<EditStreamFooter timer={timerSeconds} />} className={styles.goLive}>
      <Form
        form={form}
        style={{ position: 'relative', height: '100%' }}
        layout="horizontal"
        name="editStreamForm"
      >
        <Spinner visible={isLoading} />
        <Animation transitionName="fade" key="editStreamSettings">
          {/* STEP 1 - FILL OUT THE SETTINGS FORM */}
          {shouldShowSettings && (
            <Row gutter={16} className={styles.settingsRow} key={'platforms'}>
              {/*LEFT COLUMN*/}
              {shouldShowLeftCol && (
                <Col span={9} className={styles.leftColumn}>
                  <div className={cx(styles.columnHeader)}>
                    {$t('Update Destinations & Outputs:')}
                  </div>

                  <div className={cx(styles.columnContent, styles.updateMode)}>
                    <Scrollable className={styles.switcherWrapper}>
                      <DestinationSwitchers disabled={timerSeconds !== null} />
                    </Scrollable>
                  </div>

                  <div className={styles.leftFooter}>
                    <PrimaryChatSwitcher
                      className={cx(styles.primaryChat, {
                        [styles.disabled]: !shouldShowPrimaryChatSwitcher,
                      })}
                      enabledPlatforms={enabledPlatforms}
                      onSetPrimaryChat={setPrimaryChat}
                      primaryChat={primaryChat}
                      suffixIcon={<CaretDownOutlined />}
                      layout="horizontal"
                      logo={false}
                      border={false}
                      disabled={!shouldShowPrimaryChatSwitcher || timerSeconds !== null}
                      tooltip={
                        !shouldShowPrimaryChatSwitcher
                          ? $t('Enable multiple platforms to set primary chat.')
                          : undefined
                      }
                    />
                  </div>
                </Col>
              )}
              <Col
                span={shouldShowLeftCol ? 15 : 24}
                className={cx(styles.rightColumn, !shouldShowLeftCol && styles.destinationMode)}
              >
                <Spinner visible={isLoading} />
                <Scrollable key={'settings'} style={{ height: '100%' }} snapToWindowEdge>
                  <GoLiveError />
                  <PlatformSettings />
                </Scrollable>
              </Col>
            </Row>
          )}

          {/* STEP 2 - RUN THE CHECKLIST */}
          {shouldShowChecklist && <GoLiveChecklist className={styles.page} key={'checklist'} />}
        </Animation>
      </Form>
    </ModalLayout>
  );
}

const EditStreamFooter = memo(function EditStreamFooter(p: { timer: number | null }) {
  const { WindowsService, StreamingService } = Services;
  const { error, lifecycle, updateStream, isLoading } = useGoLiveSettings();

  const close = useCallback(() => {
    WindowsService.actions.closeChildWindow();
  }, []);

  const goBackToSettings = useCallback(() => {
    StreamingService.actions.showEditStream();
  }, []);

  const shouldShowUpdateButton = lifecycle !== 'runChecklist';
  const shouldShowGoBackButton = !shouldShowUpdateButton && error;

  return (
    <Form layout={'inline'}>
      {/* CLOSE BUTTON */}
      <Button onClick={close}>{$t('Close')}</Button>

      {/* GO BACK BUTTON */}
      {shouldShowGoBackButton && (
        <Button onClick={goBackToSettings}>{$t('Go back to settings')}</Button>
      )}

      {/* UPDATE BUTTON */}
      {shouldShowUpdateButton && (
        <Tooltip
          title={$t('Add/Remove platforms in %{timer} seconds', { timer: p.timer })}
          placement="topRight"
          lightShadow={true}
          disabled={p?.timer === null}
          className={styles.updateTooltip}
        >
          <Button type="primary" onClick={updateStream} disabled={isLoading || p?.timer !== null}>
            {$t('Update')}
          </Button>
          {/* COOLDOWN TIMER ANIMATION */}
          {p?.timer !== null && (
            <AutoProgressBar
              className={styles.updateProgress}
              percent={(3 - p?.timer) * 100}
              timeTarget={5 * 1000}
              showInfo={false}
              small
            />
          )}
        </Tooltip>
      )}
    </Form>
  );
});
