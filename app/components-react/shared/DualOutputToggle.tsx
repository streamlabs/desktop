import React, { CSSProperties, useCallback, useState } from 'react';
import { message } from 'antd';
import cx from 'classnames';
import { Services } from '../service-provider';
import { useVuex } from 'components-react/hooks';
import styles from './DualOutputToggle.m.less';
import { $t } from 'services/i18n';
import Utils from 'services/utils';
import Tooltip, { TTipPosition } from 'components-react/shared/Tooltip';
import { CheckboxInput, SwitchInput } from 'components-react/shared/inputs';
import { AuthModal } from 'components-react/shared/AuthModal';
import { alertAsync } from 'components-react/modals';

// Currently only one variant type is used but preserve the others for legacy purposes
type TDualOutputToggleType = 'checkbox' | 'switch' | 'icon';
// Currently the dual output toggle is only used in the Editor, but for legacy purposes for old analytics
// keep the other source tags
type TDualOutputAnalyticsSource = 'GoLiveWindow' | 'SourceSelector' | 'VideoSettings' | 'Editor';

interface IDualOutputToggleProps {
  source: TDualOutputAnalyticsSource;
  type?: TDualOutputToggleType;
  mode?: 'dual' | 'single';
  value?: boolean;
  className?: string;
  inputClassname?: string;
  style?: CSSProperties;
  disabled?: boolean;
  tooltipDisabled?: boolean;
  placement?: TTipPosition;
  label?: string;
}

interface IDualOutputInputProps {
  label: string;
  disabled: boolean;
  value: boolean;
  onChange: (val: boolean) => void;
  classname?: string | undefined;
}

export default function DualOutputToggle(p: IDualOutputToggleProps) {
  const {
    DualOutputService,
    StreamingService,
    TransitionsService,
    UserService,
    WindowsService,
    OnboardingService,
    SettingsService,
    UsageStatisticsService,
  } = Services;

  const v = useVuex(() => ({
    dualOutputMode: DualOutputService.views.dualOutputMode,
    studioMode: TransitionsService.views.studioMode,
    selectiveRecording: StreamingService.state.selectiveRecording,
    isMidStreamMode: StreamingService.views.isMidStreamMode,
    isLoggedIn: UserService.views.isLoggedIn,
    isPrime: UserService.views.isPrime,
    linkedPlatforms: StreamingService.views.linkedPlatforms,
  }));
  const [showModal, setShowModal] = useState(false);
  const type = p?.type ?? 'switch';
  const placement = p?.placement ?? 'bottom';
  const disabled = p?.disabled ?? false;
  const tooltip =
    !v.dualOutputMode || !v.isLoggedIn
      ? $t('Enable Dual Output to stream to horizontal & vertical platforms simultaneously')
      : $t('Disable Dual Output');

  const handleShowModal = useCallback((status: boolean) => {
    WindowsService.actions.updateStyleBlockers(Utils.isChildWindow() ? 'child' : 'main', status);
    setShowModal(status);
  }, []);

  const handleAuth = useCallback(() => {
    if (Utils.isChildWindow()) {
      WindowsService.actions.closeChildWindow();
    }

    UserService.actions.showLogin();
    const onboardingCompleted = OnboardingService.onboardingCompleted.subscribe(() => {
      DualOutputService.actions.setDualOutputModeIfPossible();
      SettingsService.actions.showSettings('Video');
      onboardingCompleted.unsubscribe();
    });
  }, []);

  const showSelectiveRecordingModal = useCallback(() => {
    alertAsync({
      type: 'confirm',
      title: $t('Selective Recording Enabled'),
      closable: true,
      content: (
        <span>
          {$t(
            'Selective Recording only works with horizontal sources and disables editing the vertical output scene. Please disable Selective Recording to go live with Dual Output.',
          )}
        </span>
      ),
      cancelText: $t('Close'),
      okText: $t('Disable'),
      okButtonProps: { type: 'primary' },
      onOk: () => {
        StreamingService.actions.setSelectiveRecording(!v.selectiveRecording);
      },
      cancelButtonProps: { style: { display: 'inline' } },
    });
  }, [v.selectiveRecording]);

  const showStudioModeModal = useCallback(() => {
    alertAsync({
      type: 'confirm',
      title: $t('Studio Mode Enabled'),
      closable: true,
      content: (
        <span>
          {$t(
            'Cannot toggle Dual Output while in Studio Mode. Please disable Studio Mode to go live with Dual Output.',
          )}
        </span>
      ),
      cancelText: $t('Close'),
      okText: $t('Disable'),
      okButtonProps: { type: 'primary' },
      onOk: () => {
        TransitionsService.actions.disableStudioMode();
      },
      cancelButtonProps: { style: { display: 'inline' } },
    });
  }, []);

  const toggleDualOutput = useCallback(
    (status?: boolean) => {
      // User must be logged in to enable dual output, so prompt them to log in if they are not
      if (!v.isLoggedIn) {
        handleShowModal(true);
        return false;
      }

      if (v.isMidStreamMode) {
        message.error({
          content: $t('Cannot toggle Dual Output while live.'),
          className: styles.toggleError,
        });
        return;
      }

      if (v.studioMode) {
        showStudioModeModal();
        message.error({
          content: $t('Cannot toggle Dual Output while in Studio Mode.'),
          className: styles.toggleError,
        });
        return;
      }

      if (!v.dualOutputMode && v.selectiveRecording) {
        showSelectiveRecordingModal();
        return;
      }

      const shouldEnableDualOutput = status ?? !v.dualOutputMode;
      // toggle dual output
      DualOutputService.actions.setDualOutputModeIfPossible(shouldEnableDualOutput, true, false);

      if (shouldEnableDualOutput) {
        UsageStatisticsService.recordFeatureUsage('DualOutput');
        UsageStatisticsService.recordAnalyticsEvent('DualOutput', {
          type: 'ToggleOnDualOutput',
          source: p.source,
          isPrime: v.isPrime,
          platforms: v.linkedPlatforms,
          tiktokStatus: Services.TikTokService.scope,
        });
      }
    },
    [
      v.isLoggedIn,
      v.isMidStreamMode,
      v.selectiveRecording,
      v.dualOutputMode,
      v.studioMode,
      v.linkedPlatforms,
      v.isPrime,
      p.source,
      handleShowModal,
      showStudioModeModal,
      showSelectiveRecordingModal,
    ],
  );

  return (
    <div
      data-testid={v.dualOutputMode ? 'dual-output-active' : 'dual-output-inactive'}
      className={cx(p?.className, styles.dualOutputToggle, {
        [styles.doTooltip]: p?.mode === 'dual',
        [styles.soTooltip]: p?.mode === 'single',
      })}
      style={p?.style}
    >
      <Tooltip title={tooltip} placement={placement} disabled={disabled} lightShadow>
        {type === 'switch' && (
          <DualOutputToggleSwitch
            label={$t('Dual Output')}
            value={v.dualOutputMode}
            onChange={toggleDualOutput}
            classname={p?.inputClassname}
            disabled={disabled}
          />
        )}
        {type === 'checkbox' && (
          <DualOutputToggleCheckbox
            label={$t('Dual Output')}
            value={v.dualOutputMode}
            onChange={toggleDualOutput}
            classname={p?.inputClassname}
            disabled={disabled}
          />
        )}
        {type === 'icon' && (
          <DualOutputToggleIcons
            label={$t('Dual Output')}
            value={v.dualOutputMode}
            onChange={toggleDualOutput}
            classname={p?.inputClassname}
            disabled={disabled}
          />
        )}
      </Tooltip>
      <AuthModal
        id="login-modal"
        prompt={$t('Please log in to enable dual output. Would you like to log in now?')}
        showModal={showModal}
        handleShowModal={handleShowModal}
        handleAuth={handleAuth}
      />
    </div>
  );
}

function DualOutputToggleCheckbox(p: IDualOutputInputProps) {
  return (
    <CheckboxInput {...p} name="dual-output-toggle" className={cx(styles.doInput, p?.classname)} />
  );
}

function DualOutputToggleSwitch(p: IDualOutputInputProps) {
  return (
    <SwitchInput
      {...p}
      name="dual-output-toggle"
      className={cx(p?.classname, { [styles.doSwitchActive]: p.value === true })}
      layout="horizontal"
      labelAlign="left"
      nomargin
      skipWrapperAttrs
    />
  );
}

function DualOutputToggleIcons(p: IDualOutputInputProps) {
  return (
    <i
      data-name="dual-output-toggle"
      className={cx('icon-dual-output icon-button icon-button--lg', {
        active: p.value === true,
        disabled: p?.disabled,
      })}
      onClick={() => {
        if (p.disabled) return;
        p.onChange(!p.value);
      }}
    />
  );
}
