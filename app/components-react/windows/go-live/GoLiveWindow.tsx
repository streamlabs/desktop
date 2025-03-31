import styles from './GoLive.m.less';
import { WindowsService, DualOutputService } from 'app-services';
import { ModalLayout } from '../../shared/ModalLayout';
import { Button, message } from 'antd';
import { Services } from '../../service-provider';
import GoLiveSettings from './GoLiveSettings';
import GoLiveBanner from './GoLiveInfoBanner';
import React from 'react';
import { $t } from '../../../services/i18n';
import GoLiveChecklist from './GoLiveChecklist';
import { alertAsync } from 'components-react/modals';
import Form from '../../shared/inputs/Form';
import Translate from 'components-react/shared/Translate';
import Animation from 'rc-animate';
import { useGoLiveSettings, useGoLiveSettingsRoot } from './useGoLiveSettings';
import { inject } from 'slap';

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

  // message.error({ content: $t('Streaming to TikTok not approved.'), duration: 200 });

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
    toggleDualOutputMode,
    isLoading,
    promptApply,
    isDualOutputMode,
    horizontalHasTargets,
  } = useGoLiveSettings().extend(module => ({
    windowsService: inject(WindowsService),
    dualOutputService: inject(DualOutputService),

    close() {
      this.windowsService.actions.closeChildWindow();
    },

    goBackToSettings() {
      module.prepopulate();
    },

    toggleDualOutputMode() {
      this.dualOutputService.actions.setDualOutputMode(false, true, true);
    },

    get horizontalHasTargets() {
      const platformDisplays = module.state.activeDisplayPlatforms;
      const destinationDisplays = module.state.activeDisplayDestinations;

      return platformDisplays.horizontal.length > 0 || destinationDisplays.horizontal.length > 0;
    },

    get promptApply() {
      return Services.TikTokService.promptApply;
    },

    get isDualOutputMode() {
      return Services.TikTokService.promptApply;
    },
  }));

  const shouldShowConfirm = ['prepopulate', 'waitForNewSettings'].includes(lifecycle);
  const shouldShowGoBackButton =
    lifecycle === 'runChecklist' && error && checklist.startVideoTransmission !== 'done';

  function handleGoLive() {
    if (isDualOutputMode && !getCanStreamDualOutput()) {
      handleConfirmGoLive();
      return;
    }

    goLive();
  }

  function handleConfirmGoLive() {
    const display = horizontalHasTargets ? $t('Horizontal') : $t('Vertical');

    alertAsync({
      type: 'warning',
      title: $t('Confirm Horizontal and Vertical Platforms'),
      closable: true,
      content: (
        <Translate
          message={$t(
            'All platforms are currently assigned to the <display></display> display. To use Dual Output you must stream to one horizontal and one vertical platform. Do you want to go live in single output mode with the Horizontal display?',
          )}
          renderSlots={{
            display: () => {
              return <span key={display}>{display}</span>;
            },
          }}
        ></Translate>
      ),
      cancelText: $t('Close'),
      okText: $t('Confirm'),
      okButtonProps: { type: 'primary' },
      onOk: () => toggleDualOutputMode(),
      cancelButtonProps: { style: { display: 'inline' } },
    });
  }

  return (
    <Form layout={'inline'}>
      {promptApply && <GoLiveBanner />}
      {/* CLOSE BUTTON */}
      <Button onClick={close}>{$t('Close')}</Button>

      {/* GO BACK BUTTON */}
      {shouldShowGoBackButton && (
        <Button onClick={goBackToSettings}>{$t('Go back to settings')}</Button>
      )}

      {/* GO LIVE BUTTON */}
      {shouldShowConfirm && (
        <Button
          data-testid="confirmGoLiveBtn"
          type="primary"
          onClick={handleGoLive}
          disabled={isLoading || !!error}
        >
          {$t('Confirm & Go Live')}
        </Button>
      )}
    </Form>
  );
}
