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
import TwitterInput from './Twitter';
import debounce from 'lodash/debounce';

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
    lifecycle,
    checklist,
    goLive,
    close,
    goBackToSettings,
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
    setStreamShift,
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
      return this.restreamService.views.streamShiftForceGoLive;
    },

    async checkIsLive() {
      return this.restreamService.actions.checkIsLive();
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

    goLiveWithDefaultCodec() {
      this.settingsService.actions.setDefaultVideoEncoder();
      module.goLive();
    },

    showSettings() {
      this.settingsService.actions.showSettings('Output');
    },
  }));

  const [isCoolingDown, setIsCoolingDown] = useState(false);

  // Use refs to track stream status fetching and whether the user should go live to avoid
  // unnecessary rerenders that could effect persistence of the status during the async checks
  const isFetchingStreamStatus = useRef(false);
  const shouldGoLive = useRef(false);

  useEffect(() => {
    // Check if user is live on mount to handle the case where the stream switcher status
    // changed while the user had the Go Live Window closed.
    isFetchingStreamStatus.current = true;

    const subscription = Services.RestreamService.isLive.subscribe(async isLive => {
      if (!isPrime) return;
      if (shouldGoLive.current) {
        goLive();
        shouldGoLive.current = false;
        return;
      }

      isFetchingStreamStatus.current = false;

      // Prompt to confirm stream switch if the stream exists
      // TODO: unify with start streaming button prompt
      if (isLive && !streamShiftForceGoLive) {
        await promptStreamShift();
      } else if (!isLive && hasIncompatibleCodec) {
        console.log('Incompatible codec detected, prompting user to change codec');
        // If the user is not live but has an incompatible codec, prompt to change codec
        await promptUseDefaultCodec();
      }
    });

    debouncedCheckIsLive();
    isFetchingStreamStatus.current = false;

    return () => {
      debouncedCheckIsLive.cancel();
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    // Timer for cooldown on stream switcher from the user forcing start while live on another device.
    // Use the `isFetchingStreamStatus` ref to track the cooldown to prevent the user from fetching
    // the status during the cooldown
    if (!isCoolingDown) return;

    const timer = setTimeout(() => {
      setIsCoolingDown(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, [isCoolingDown]);

  const shouldShowConfirm = ['prepopulate', 'waitForNewSettings'].includes(lifecycle);
  const shouldShowGoBackButton =
    lifecycle === 'runChecklist' && error && checklist.startVideoTransmission !== 'done';
  const shouldShowRecordingSwitcher = ['empty', 'prepopulate', 'waitForNewSettings'].includes(
    lifecycle,
  );

  const promptStreamShift = useCallback(async () => {
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
          startStreamShift();
          close();
        }
      },
      cancelBtnText: $t('Cancel'),
      cancelBtnPosition: 'left',
      cancelFn: () => close(),
      secondaryActionText: $t('Force Start'),
      secondaryActionFn: async () => {
        setStreamShift(false);
        setIsCoolingDown(true);
        await forceStreamShiftGoLive();
      },
    });
  }, [hasIncompatibleCodec]);

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
  }, [hasIncompatibleCodec, isStreamShiftMode, isDualOutputMode, codec]);

  const debouncedCheckIsLive = debounce(checkIsLive, 1000);

  const startStreamShift = useCallback(() => {
    if (isDualOutputMode) {
      Services.DualOutputService.actions.toggleDisplay(false, 'vertical');
    }

    goLive();
  }, [isDualOutputMode]);

  const handleGoLive = useCallback(async () => {
    if (
      isPrime &&
      !streamShiftForceGoLive &&
      !isFetchingStreamStatus.current === false &&
      shouldGoLive.current === false
    ) {
      shouldGoLive.current = true;
      isFetchingStreamStatus.current = true;
      try {
        // This will resolve with the subscription to the restream service `isLive` observable
        debouncedCheckIsLive();
        return;
      } catch (e: unknown) {
        console.error('Error checking stream switcher status:', e);

        isFetchingStreamStatus.current = false;
      }
    }

    goLive();
  }, [
    isDualOutputMode,
    isPrime,
    streamShiftForceGoLive,
    hasIncompatibleCodec,
    debouncedCheckIsLive,
    goLive,
  ]);

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
          {isCoolingDown || isFetchingStreamStatus.current === true ? (
            <i className="fa fa-spinner fa-pulse" />
          ) : (
            $t('Confirm & Go Live')
          )}
        </Button>
      )}
    </Form>
  );
}
