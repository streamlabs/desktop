import styles from './GoLive.m.less';
import { ModalLayout } from '../../shared/ModalLayout';
import { Button, Col, Row } from 'antd';
import { inject, useOnCreate } from 'slap';
import { Services } from '../../service-provider';
import React, { memo, useEffect, useState } from 'react';
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
import GoLiveInfoBanner from './GoLiveInfoBanner';
import { WindowsService } from 'services/windows';
import { StreamingService } from 'services/streaming';

export default function EditStreamWindow() {
  const { StreamingService } = Services;
  const {
    prepopulate,
    form,
    shouldShowSettings,
    shouldShowChecklist,
    cooldownTimer,
  } = useGoLiveSettingsRoot({ isUpdateMode: true }).extend(module => ({
    destroy() {
      // Toggling a target persists it immediately, but it only reaches the stream on Update, so
      // drop anything the user switched and then closed the window without applying.
      module.restoreTargets();
    },

    get shouldShowChecklist() {
      return module.lifecycle === 'runChecklist';
    },

    get shouldShowSettings() {
      return module.lifecycle !== 'runChecklist';
    },
  }));

  useOnCreate(() => {
    // the streamingService still may keep a error from GoLive flow like a "Post a Tweet" error
    // reset error for allowing update channel info
    StreamingService.actions.resetError();
    prepopulate();
  });

  // 10-second countdown timer state
  const [timer, setTimer] = useState<number | null>(null);

  useEffect(() => {
    const subscription = cooldownTimer.subscribe(() => {
      setTimer(10);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    // 3-second countdown timer for cooldown after adding/removing targets
    if (timer && timer > 0) {
      const timeout = setTimeout(() => {
        setTimer(timer - 1);
      }, 1000);
      return () => clearTimeout(timeout);
    } else if (timer === 0) {
      // Clear the timer when it reaches 0
      setTimer(null);
    }
  }, [timer]);
  return (
    <ModalLayout footer={<EditStreamFooter timer={timer} />} className={styles.goLiveSettings}>
      <Form
        form={form}
        style={{ position: 'relative', height: '100%' }}
        layout="horizontal"
        name="editStreamForm"
      >
        <Animation transitionName="fade" key="editStreamSettings">
          {/* STEP 1 - FILL OUT THE SETTINGS FORM */}
          {shouldShowSettings && <EditStreamSettings timer={timer} key="settings" />}

          {/* STEP 2 - RUN THE CHECKLIST */}
          {shouldShowChecklist && <GoLiveChecklist className={styles.page} key={'checklist'} />}
        </Animation>
      </Form>
    </ModalLayout>
  );
}

const EditStreamSettings = memo(function EditStreamSettings(p: { timer: number | null }) {
  const {
    shouldShowLeftCol,
    isLoading,
    enabledPlatforms,
    hasMultiplePlatforms,
    primaryChat,
    setPrimaryChat,
  } = useGoLiveSettings().extend(module => ({
    get shouldShowLeftCol() {
      return (
        module.protectedModeEnabled && module.isMidStreamMode && module.isLiveOutputEditingEnabled
      );
    },
  }));

  const primaryChatSelectorDisabled = !hasMultiplePlatforms || p.timer !== null;

  return (
    <Row gutter={8} className={styles.goLiveSettings}>
      {/*LEFT COLUMN*/}
      {shouldShowLeftCol && (
        <Col span={9} className={cx(styles.leftColumn, styles.updateMode)}>
          <h2>{$t('Update Destinations & Outputs:')}</h2>
          <Scrollable className={cx(styles.leftColumnScroll, styles.updateMode)}>
            <DestinationSwitchers disabled={p.timer !== null} />
            <div className={styles.leftFooter}>
              <PrimaryChatSwitcher
                className={cx(styles.primaryChat, {
                  [styles.disabled]: primaryChatSelectorDisabled,
                })}
                enabledPlatforms={enabledPlatforms}
                onSetPrimaryChat={setPrimaryChat}
                primaryChat={primaryChat}
                suffixIcon={<CaretDownOutlined />}
                layout="horizontal"
                logo={false}
                border={false}
                disabled={primaryChatSelectorDisabled}
              />
            </div>
          </Scrollable>
        </Col>
      )}

      <Col
        span={shouldShowLeftCol ? 15 : 24}
        className={cx(styles.rightColumn, { [styles.destinationMode]: !shouldShowLeftCol })}
      >
        <Spinner visible={isLoading} />
        <GoLiveError />
        <Scrollable className={styles.rightColumnScroll} snapToWindowEdge>
          <PlatformSettings />
        </Scrollable>
      </Col>
    </Row>
  );
});

const EditStreamFooter = memo(function EditStreamFooter(p: { timer: number | null }) {
  const {
    isLoading,
    shouldShowUpdateButton,
    shouldShowGoBackButton,
    updateStream,
    closeChildWindow,
    goBackToSettings,
  } = useGoLiveSettings().extend(module => {
    return {
      windowsService: inject(WindowsService),
      streamingService: inject(StreamingService),

      closeChildWindow() {
        this.windowsService.actions.closeChildWindow();
      },
      goBackToSettings() {
        this.streamingService.actions.showEditStream();
      },

      get shouldShowUpdateButton() {
        return module.lifecycle !== 'runChecklist';
      },
      get shouldShowGoBackButton() {
        return module.lifecycle === 'runChecklist' && !!module.error;
      },
    };
  });

  const isCoolingDown = !!p.timer && p.timer > 0;

  return (
    <Form layout={'inline'}>
      <div className={styles.goLiveFooter}>
        {p.timer !== null && <GoLiveInfoBanner message={$t('Update takes up to 10 seconds')} />}
      </div>
      {/* CLOSE BUTTON */}
      <Button onClick={closeChildWindow}>{$t('Close')}</Button>

      {/* GO BACK BUTTON */}
      {shouldShowGoBackButton && (
        <Button onClick={goBackToSettings}>{$t('Go back to settings')}</Button>
      )}

      {/* UPDATE BUTTON */}
      {shouldShowUpdateButton && (
        <Button
          type={isCoolingDown ? 'default' : 'primary'}
          onClick={updateStream}
          disabled={isLoading || isCoolingDown}
          className={styles.confirmBtn}
        >
          <div className={styles.updateBtn}>
            <Spinner visible={isCoolingDown} inline delay={200} style={{ marginRight: '5px' }} />
            <span>{isCoolingDown ? $t('Updating') : $t('Update')}</span>
          </div>
        </Button>
      )}
    </Form>
  );
});
