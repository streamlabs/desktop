import React, { useState, useCallback } from 'react';
import styles from './GoLive.m.less';
import { WindowsService } from 'services/windows';
import {
  SettingsService,
  EIncompatibleRestreamCodec,
  incompatibleRestreamCodecs,
} from 'services/settings';
import { RestreamService } from 'services/restream';
import { ModalLayout } from '../../shared/ModalLayout';
import { Button, message } from 'antd';
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
  const { lifecycle, form } = useGoLiveSettingsRoot().extend(module => ({
    destroy() {
      // clear failed checks and warnings on window close
      if (module.checklist.startVideoTransmission !== 'done') {
        Services.StreamingService.actions.resetInfo();
      }
    },
  }));

  const shouldShowSettings = ['empty', 'prepopulate', 'waitForNewSettings'].includes(lifecycle);
  const shouldShowChecklist = ['runChecklist', 'live'].includes(lifecycle);

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
    isStreamShiftMode,
    hasIncompatibleCodec,
    streamShiftForceGoLive,
    codec,
    checkIsLive,
    forceStreamShiftGoLive,
    goLiveWithDefaultCodec,
    showSettings,
  } = useGoLiveSettings().extend(module => ({
    windowsService: inject(WindowsService),
    settingsService: inject(SettingsService),
    restreamService: inject(RestreamService),

    close() {
      this.windowsService.actions.closeChildWindow();
    },

    goBackToSettings() {
      module.prepopulate();
    },

    get streamShiftForceGoLive() {
      return this.restreamService.state.streamShiftForceGoLive;
    },

    async checkIsLive() {
      return this.restreamService.actions.return.checkIsLive();
    },

    async forceStreamShiftGoLive() {
      this.restreamService.actions.forceStreamShiftGoLive(true);
    },

    get hasIncompatibleCodec() {
      return (
        module.codec &&
        Object.values(EIncompatibleRestreamCodec).includes(
          module.codec as EIncompatibleRestreamCodec,
        ) &&
        module.shouldSetupRestream
      );
    },

    goLiveWithDefaultCodec() {
      this.settingsService.actions.setDefaultVideoEncoder();
      module.goLive();
    },

    showSettings() {
      this.settingsService.actions.showSettings('Output');
    },
  }));

  const [isFetchingStreamStatus, setIsFetchingStreamStatus] = useState(false);

  const shouldShowConfirm = ['prepopulate', 'waitForNewSettings'].includes(lifecycle);
  const shouldShowGoBackButton =
    lifecycle === 'runChecklist' && error && checklist.startVideoTransmission !== 'done';
  const shouldShowRecordingSwitcher = ['empty', 'prepopulate', 'waitForNewSettings'].includes(
    lifecycle,
  );

  const promptUseDefaultCodec = useCallback(async () => {
    // If the user is not live but has an incompatible codec, prompt to change codec
    let message = $t(
      '%{videoCodec} codec is not supported for Multistream. Would you like to proceed with the H.264 codec or select another codec?',
      { videoCodec: incompatibleRestreamCodecs(codec as EIncompatibleRestreamCodec) },
    );

    if (isStreamShiftMode) {
      message = $t(
        '%{videoCodec} codec is not supported for Stream Shift. Would you like to proceed with the H.264 codec or select another codec?',
        { videoCodec: incompatibleRestreamCodecs(codec as EIncompatibleRestreamCodec) },
      );
    }

    if (isDualOutputMode) {
      message = $t(
        '%{videoCodec} codec is not supported for Dual Output streaming to more than two destinations. Would you like to proceed with the H.264 codec or select another codec?',
        { videoCodec: incompatibleRestreamCodecs(codec as EIncompatibleRestreamCodec) },
      );
    }

    await promptAction({
      title: $t('Incompatible Codec Detected'),
      message,
      btnText: $t('Use H.264 Codec'),
      fn: goLiveWithDefaultCodec,
      cancelBtnText: $t('Cancel'),
      cancelBtnPosition: 'left',
      secondaryActionText: $t('Select Codec'),
      secondaryActionFn: showSettings,
    });
  }, [hasIncompatibleCodec, isStreamShiftMode, isDualOutputMode, codec]);

  const handleGoLive = useCallback(async () => {
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

    if (isPrime) {
      try {
        setIsFetchingStreamStatus(true);
        const isLive = await checkIsLive();
        setIsFetchingStreamStatus(false);

        // Prompt to confirm stream switch if the stream exists
        // TODO: unify with start streaming button prompt
        if (isLive && !streamShiftForceGoLive) {
          let shouldForceGoLive = false;

          await promptAction({
            title: $t('Another stream detected'),
            message: $t(
              'A stream on another device has been detected. Would you like to switch your stream to Streamlabs Desktop? If you do not wish to continue this stream, please end it from the current streaming source. If you\'re sure you\'re not live and it has been incorrectly detected, choose "Force Start" below.',
            ),
            btnText: $t('Switch to Streamlabs Desktop'),
            fn: () => {
              // If the user is live and has an incompatible codec, prompt to change codec
              // or the stream will not go live
              if (hasIncompatibleCodec) {
                promptUseDefaultCodec();
              } else {
                goLive();
                close();
              }
            },
            cancelBtnText: $t('Cancel'),
            cancelBtnPosition: 'left',
            secondaryActionText: $t('Force Start'),
            secondaryActionFn: async () => {
              forceStreamShiftGoLive();
              shouldForceGoLive = true;
            },
          });

          if (!shouldForceGoLive) return;
        } else if (!isLive && hasIncompatibleCodec) {
          console.log('Incompatible codec detected, prompting user to change codec');
          // If the user is not live but has an incompatible codec, prompt to change codec
          await promptUseDefaultCodec();
          return;
        }
      } catch (e: unknown) {
        console.error('Error checking stream switcher status:', e);

        setIsFetchingStreamStatus(false);
      }
    }

    goLive();
  }, [isDualOutputMode, isPrime, streamShiftForceGoLive, hasIncompatibleCodec]);

  return (
    <Form layout={'inline'}>
      {shouldShowRecordingSwitcher && shouldShowConfirm && (
        <RecordingSwitcher showRecordingToggle={true} />
      )}

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
