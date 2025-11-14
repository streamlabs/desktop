import React, { useState, useEffect } from 'react';
import styles from './GoLive.m.less';
import { WindowsService } from 'app-services';
import { ModalLayout } from '../../shared/ModalLayout';
import { Button, message, Modal } from 'antd';
import { Services } from '../../service-provider';
import GoLiveSettings from './GoLiveSettings';
import { $t } from '../../../services/i18n';
import GoLiveChecklist from './GoLiveChecklist';
import Form from '../../shared/inputs/Form';
import Animation from 'rc-animate';
import { useGoLiveSettings, useGoLiveSettingsRoot } from './useGoLiveSettings';
import { inject } from 'slap';
import RecordingSwitcher from './RecordingSwitcher';
import { promptAction } from 'components-react/modals';

export default function GoLiveWindow() {
  const { lifecycle, form, destroy } = useGoLiveSettingsRoot().extend(module => ({
    destroy() {
      // clear failed checks and warnings on window close
      if (module.checklist.startVideoTransmission !== 'done') {
        Services.StreamingService.actions.resetInfo();
      }
    },
  }));

  const shouldShowSettings = ['empty', 'prepopulate', 'waitForNewSettings'].includes(lifecycle);
  const shouldShowChecklist = ['runChecklist', 'live'].includes(lifecycle);

  useEffect(() => {
    return () => {
      destroy();
      // Note: the below will only destroy modals in the Go Live window and will not effect other windows
      Modal.destroyAll();
    };
  }, []);

  return (
    <ModalLayout footer={<ModalFooter />} className={styles.dualOutputGoLive}>
      <Form
        form={form!}
        style={{ position: 'relative', height: '100%' }}
        layout="horizontal"
        name="editStreamForm"
      >
        <Animation transitionName={shouldShowChecklist ? 'slideright' : ''}>
          {/* STEP 1 - FILL OUT THE SETTINGS FORM */}
          {shouldShowSettings && <GoLiveSettings key={'settings'} />}

          {/* STEP 2 - RUN THE CHECKLIST */}
          {shouldShowChecklist && <GoLiveChecklist className={styles.page} key={'checklist'} />}
        </Animation>
      </Form>
    </ModalLayout>
  );
}

function ModalFooter() {
  const {
    error,
    lifecycle,
    checklist,
    goLive,
    close,
    goBackToSettings,
    getCanStreamDualOutput,
    isLoading,
    isDualOutputMode,
    isPrime,
  } = useGoLiveSettings().extend(module => ({
    windowsService: inject(WindowsService),

    close() {
      this.windowsService.actions.closeChildWindow();
    },

    goBackToSettings() {
      module.prepopulate();
    },
  }));

  const [isFetchingStreamStatus, setIsFetchingStreamStatus] = useState(false);

  const shouldShowConfirm = ['prepopulate', 'waitForNewSettings'].includes(lifecycle);
  const shouldShowGoBackButton =
    lifecycle === 'runChecklist' && error && checklist.startVideoTransmission !== 'done';

  async function handleGoLive() {
    if (isPrime) {
      try {
        setIsFetchingStreamStatus(true);
        const isLive = await Services.RestreamService.checkIsLive();
        setIsFetchingStreamStatus(false);

        // Prompt to confirm stream switch if the stream exists
        // TODO: unify with start streaming button prompt
        const { streamShiftForceGoLive } = Services.RestreamService.state;
        if (isLive && !streamShiftForceGoLive) {
          let shouldForceGoLive = false;

          await promptAction({
            title: $t('Another stream detected'),
            message: $t(
              'A stream on another device has been detected. Would you like to switch your stream to Streamlabs Desktop? If you do not wish to continue this stream, please end it from the current streaming source. If you\'re sure you\'re not live and it has been incorrectly detected, choose "Force Start" below.',
            ),
            btnText: $t('Switch to Streamlabs Desktop'),
            fn: () => {
              goLive();
              close();
            },
            cancelBtnText: $t('Cancel'),
            cancelBtnPosition: 'left',
            secondaryActionText: $t('Force Start'),
            secondaryActionFn: async () => {
              Services.RestreamService.actions.forceStreamShiftGoLive(true);
              shouldForceGoLive = true;
            },
          });

          if (!shouldForceGoLive) return;
        }
      } catch (e: unknown) {
        console.error('Error checking stream switcher status:', e);

        setIsFetchingStreamStatus(false);
      }
    }

    if (isDualOutputMode && !getCanStreamDualOutput()) {
      message.error({
        key: 'dual-output-error',
        className: styles.errorAlert,
        content: (
          <div className={styles.alertContent}>
            <div style={{ marginRight: '10px' }}>
              {$t(
                'To use Dual Output you must stream to one horizontal and one vertical platform.',
              )}
            </div>

            <i className="icon-close" />
          </div>
        ),
        onClick: () => message.destroy('dual-output-error'),
      });
      return;
    }

    goLive();
  }

  return (
    <Form layout={'inline'}>
      {!isDualOutputMode && shouldShowConfirm && <RecordingSwitcher />}
      {/* CLOSE BUTTON */}
      <Button onClick={close}>{$t('Close')}</Button>

      {/* GO BACK BUTTON */}
      {shouldShowGoBackButton && (
        <Button onClick={goBackToSettings}>{$t('Go back to settings')}</Button>
      )}

      {/* GO LIVE BUTTON */}
      {shouldShowConfirm && (
        <Button
          data-name="confirmGoLiveBtn"
          type="primary"
          onClick={handleGoLive}
          disabled={isLoading || !!error}
          className={styles.confirmBtn}
        >
          {isFetchingStreamStatus ? (
            <i className="fa fa-spinner fa-pulse" />
          ) : (
            $t('Confirm & Go Live')
          )}
        </Button>
      )}
    </Form>
  );
}
