import React, { useCallback, useEffect, useRef, useState } from 'react';
import styles from './GoLive.m.less';
import { WindowsService } from 'services/windows';
import {
  SettingsService,
  EIncompatibleRestreamCodec,
  incompatibleRestreamCodecs,
} from 'services/settings';
import { RestreamService } from 'services/restream';
import { ModalLayout } from '../../shared/ModalLayout';
import { Button } from 'antd';
import { alertInfo } from '../../modals';
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
import TwitterInput from './Twitter';

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
    <ModalLayout footer={<ModalFooter />} className={styles.goLiveSettings}>
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
    goLive,
    close,
    goBackToSettings,
    isLoading,
    isDualOutputMode,
    isPrime,
    isStreamShiftMode,
    hasIncompatibleCodec,
    streamShiftStatus,
    codec,
    checkIsLive,
    forceStreamShiftGoLive,
    goLiveWithDefaultCodec,
    showSettings,
    setStreamShift,
    clearStreamShiftPending,
    hasValidDisplayAssignment,
    shouldShowConfirm,
    shouldShowGoBackButton,
    shouldShowRecordingSwitcher,
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

    get streamShiftStatus() {
      return module.streamShiftStatus;
    },

    async checkIsLive() {
      return this.restreamService.actions.return.checkIsLive();
    },

    async forceStreamShiftGoLive() {
      this.restreamService.actions.forceStreamShiftGoLive();
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

    get shouldShowConfirm() {
      return ['prepopulate', 'waitForNewSettings'].includes(module.lifecycle);
    },

    get shouldShowGoBackButton() {
      return (
        module.lifecycle === 'runChecklist' &&
        module.error &&
        module.checklist.startVideoTransmission !== 'done'
      );
    },

    get shouldShowRecordingSwitcher() {
      return ['empty', 'prepopulate', 'waitForNewSettings'].includes(module.lifecycle);
    },

    goLiveWithDefaultCodec() {
      this.settingsService.actions.setDefaultVideoEncoder();
      module.goLive();
    },

    showSettings() {
      this.settingsService.actions.showSettings('Output');
    },

    clearStreamShiftPending() {
      this.restreamService.actions.setStreamShiftStatus('inactive');
    },
  }));

  const [isCoolingDown, setIsCoolingDown] = useState(false);
  const isStreamShiftPromptShown = useRef(false);

  // Check stream shift status on mount for Prime users
  useEffect(() => {
    if (!isPrime) return;
    checkIsLive().catch((e: unknown) => {
      console.error('Error checking stream shift status on mount:', e);
    });
  }, []);

  const promptUseDefaultCodec = useCallback(async () => {
    // If the user is not live but has an incompatible codec, prompt to change codec
    let message = $t(
      '%{videoCodec} codec is not supported for Multistream. Would you like to proceed with the H.264 codec or select another codec?',
      { videoCodec: incompatibleRestreamCodecs(codec as EIncompatibleRestreamCodec) },
    );

    if (isStreamShiftMode) {
      message = $t(
        '%{videoCodec} codec is not supported for Stream Shift. Would you like to proceed with the H.264 codec or select another codec?',
        {
          videoCodec:
            incompatibleRestreamCodecs(codec as EIncompatibleRestreamCodec) ?? $t('Video'),
        },
      );
    }

    if (isDualOutputMode) {
      message = $t(
        '%{videoCodec} codec is not supported for Dual Output streaming to more than two destinations. Would you like to proceed with the H.264 codec or select another codec?',
        {
          videoCodec:
            incompatibleRestreamCodecs(codec as EIncompatibleRestreamCodec) ?? $t('Video'),
        },
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
  }, [isStreamShiftMode, isDualOutputMode, codec, goLiveWithDefaultCodec, showSettings]);

  const startStreamShift = useCallback(() => {
    if (isDualOutputMode) {
      Services.DualOutputService.actions.toggleDisplay(false, 'vertical');
    }

    setStreamShift(true);
    goLive();
  }, [isDualOutputMode, goLive, setStreamShift]);

  const promptStreamShift = useCallback(async () => {
    isStreamShiftPromptShown.current = true;
    await promptAction({
      title: $t('Another stream detected'),
      message: $t(
        'A stream on another device has been detected. Would you like to switch your stream to Streamlabs Desktop? If you do not wish to continue this stream, please end it from the current streaming source. If you\'re sure you\'re not live and it has been incorrectly detected, choose "Force Start" below.',
      ),
      btnText: $t('Switch to Streamlabs Desktop'),
      fn: () => {
        isStreamShiftPromptShown.current = false;
        if (hasIncompatibleCodec) {
          promptUseDefaultCodec();
        } else {
          startStreamShift();
          close();
        }
      },
      cancelBtnText: $t('Cancel'),
      cancelBtnPosition: 'left',
      cancelFn: () => {
        isStreamShiftPromptShown.current = false;
        clearStreamShiftPending();
        close();
      },
      secondaryActionText: $t('Force Start'),
      secondaryActionFn: async () => {
        isStreamShiftPromptShown.current = false;
        setStreamShift(false);
        setIsCoolingDown(true);
        await forceStreamShiftGoLive();
      },
      maskClosable: false,
    });
  }, [
    hasIncompatibleCodec,
    startStreamShift,
    close,
    forceStreamShiftGoLive,
    promptUseDefaultCodec,
    clearStreamShiftPending,
  ]);

  // When the streaming service detects an active stream on another device, show the prompt
  useEffect(() => {
    if (streamShiftStatus !== 'pending') return;
    if (isStreamShiftPromptShown.current) return;
    promptStreamShift();
  }, [streamShiftStatus, promptStreamShift]);

  useEffect(() => {
    if (!isCoolingDown) return;

    const timer = setTimeout(() => {
      setIsCoolingDown(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, [isCoolingDown]);

  const handleGoLive = useCallback(async () => {
    if (!isPrime) {
      // Check to see if the user has a valid display assignment
      if (!hasValidDisplayAssignment) {
        alertInfo({
          name: 'dual-output-info-alert',
          text: $t(
            'To use Dual Output you must stream to at least one horizontal and one vertical platform.',
          ),
        });

        return;
      }
    }

    // Check for incompatible codec before going live (non-stream-shift case)
    if (hasIncompatibleCodec) {
      await promptUseDefaultCodec();
      return;
    }

    // The streaming service handles the stream shift check internally
    goLive();
  }, [isPrime, hasValidDisplayAssignment, hasIncompatibleCodec, promptUseDefaultCodec, goLive]);

  return (
    <Form layout={'inline'}>
      <div className={styles.goLiveFooter}>
        <TwitterInput />
        {shouldShowRecordingSwitcher && shouldShowConfirm && (
          <RecordingSwitcher showRecordingToggle={true} />
        )}
      </div>
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
          disabled={isLoading || !!error || isCoolingDown}
          className={styles.confirmBtn}
        >
          {isCoolingDown ? <i className="fa fa-spinner fa-pulse" /> : $t('Confirm & Go Live')}
        </Button>
      )}
    </Form>
  );
}
