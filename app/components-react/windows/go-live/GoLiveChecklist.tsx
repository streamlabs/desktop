import { useGoLiveSettings } from './useGoLiveSettings';
import css from './GoLiveChecklist.m.less';
import React, { HTMLAttributes, useEffect, useMemo } from 'react';
import { Services } from '../../service-provider';
import { $t } from '../../../services/i18n';
import { TGoLiveChecklistItemState } from '../../../services/streaming';
import {
  ICustomStreamDestination,
  TDestinationId,
  getDestinationId,
} from '../../../services/settings/streaming';
import cx from 'classnames';
import GoLiveError from './GoLiveError';
import MessageLayout from './MessageLayout';
import { Timeline } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import Utils from '../../../services/utils';
import { difference, intersection } from 'lodash';

/**
 * Shows transition to live progress and helps troubleshoot related problems
 */
export default function GoLiveChecklist(p: HTMLAttributes<unknown>) {
  const { VideoEncodingOptimizationService, WindowsService } = Services;
  const {
    error,
    enabledPlatforms,
    lifecycle,
    isMultiplatformMode,
    isDualOutputMode,
    isStreamShiftMode,
    checklist,
    warning,
    getPlatformDisplayName,
    isUpdateMode,
    shouldShowOptimizedProfile,
    showLiveOutputEditing,
    stopTargets,
    startTargets,
    continueTargets,
    stopDestinations,
    startDestinations,
    continueDestinations,
    isLiveOutputEditingEnabled,
    isUpdatingTargets,
  } = useGoLiveSettings().extend(module => ({
    get shouldShowOptimizedProfile() {
      return VideoEncodingOptimizationService.state.useOptimizedProfile && !module.isUpdateMode;
    },

    get showLiveOutputEditing() {
      return module.isLiveOutputEditingEnabled && module.isUpdateMode;
    },

    get stopTargets() {
      return module.activePlatforms
        ? difference(module.activePlatforms, module.enabledPlatforms)
        : [];
    },

    get stopDestinations(): TDestinationId[] {
      return module.activeDestinations
        ? difference(
            module.activeDestinations.map(d => getDestinationId(d)),
            module.enabledCustomDestinations.map(d => getDestinationId(d)),
          )
        : [];
    },

    get startDestinations(): TDestinationId[] {
      return module.activeDestinations
        ? difference(
            module.enabledCustomDestinations.map(d => getDestinationId(d)),
            module.activeDestinations.map(d => getDestinationId(d)),
          )
        : [];
    },

    get startTargets() {
      return module.activePlatforms
        ? difference(module.enabledPlatforms, module.activePlatforms)
        : [];
    },

    get continueTargets() {
      return module.activePlatforms
        ? intersection(module.enabledPlatforms, module.activePlatforms)
        : [];
    },

    get continueDestinations(): TDestinationId[] {
      return module.activeDestinations
        ? intersection(
            module.enabledCustomDestinations.map(d => getDestinationId(d)),
            module.activeDestinations.map(dest => getDestinationId(dest)),
          )
        : [];
    },
  }));

  const success = lifecycle === 'live';

  // close this window in 1s after start streaming
  useEffect(() => {
    if (lifecycle === 'live' && !warning) {
      Utils.sleep(1000).then(() => {
        if (WindowsService.state.child.componentName === 'GoLiveWindow') {
          WindowsService.actions.closeChildWindow();
        }
      });
    }
  }, [lifecycle]);

  function render() {
    return (
      <div className={cx(css.container, p.className, { [css.success]: success })}>
        <h1 className={css.success}>{headerText}</h1>

        <Timeline>
          {/* GO LIVE PLATFORMS UPDATE */}
          {(!isUpdateMode || !showLiveOutputEditing) &&
            enabledPlatforms.map(platform =>
              renderCheck(
                $t('Update settings for %{platform}', {
                  platform: getPlatformDisplayName(platform),
                }),
                checklist[platform],
              ),
            )}

          {/* EDIT STREAM - STOP TARGETS */}
          {showLiveOutputEditing && (
            <>
              {stopTargets.map(platform =>
                renderCheck(
                  $t('Stop streaming to %{target}', {
                    target: getPlatformDisplayName(platform),
                  }),
                  checklist[platform],
                ),
              )}
              {stopDestinations.length > 0 &&
                renderCheck($t('Stop streaming to Custom Destination'), checklist.destination)}
            </>
          )}

          {/* EDIT STREAM - START TARGETS */}
          {showLiveOutputEditing && (
            <>
              {startTargets.map(platform =>
                renderCheck(
                  $t('Start streaming to %{target}', {
                    target: getPlatformDisplayName(platform),
                  }),
                  checklist[platform],
                ),
              )}
              {startDestinations.length > 0 &&
                renderCheck($t('Start streaming to Custom Destination'), checklist.destination)}
            </>
          )}

          {/* EDIT STREAM - CONTINUE/UPDATE TARGETS */}
          {showLiveOutputEditing && (
            <>
              {continueTargets.map(platform =>
                renderCheck(
                  $t('Update settings for %{platform}', {
                    platform: getPlatformDisplayName(platform),
                  }),
                  checklist[platform],
                ),
              )}
              {continueDestinations.length > 0 &&
                renderCheck($t('Continue streaming to Custom Destination'), checklist.destination)}
            </>
          )}

          {/* RESTREAM */}
          {shouldRenderMultistreamItem &&
            renderCheck(multistreamItemText, checklist.setupMultistream)}

          {/* DUAL OUTPUT */}
          {!isUpdateMode &&
            isDualOutputMode &&
            renderCheck($t('Configure the Dual Output service'), checklist.setupDualOutput)}

          {/* OPTIMIZED PROFILE */}
          {shouldShowOptimizedProfile &&
            renderCheck($t('Apply optimized settings'), checklist.applyOptimizedSettings)}

          {/* START TRANSMISSION */}
          {!isUpdateMode &&
            renderCheck($t('Start video transmission'), checklist.startVideoTransmission)}
        </Timeline>

        {/* WARNING MESSAGE */}
        {warning === 'YT_AUTO_START_IS_DISABLED' && renderYtWarning()}

        {/* ERROR MESSAGE */}
        <GoLiveError />
      </div>
    );
  }

  const shouldRenderMultistreamItem = useMemo(() => {
    // Check to render in Go Live checklist
    if (!isUpdateMode && isMultiplatformMode) {
      return true;
    }

    // Check to render in Edit Stream checklist
    if (isUpdateMode && isUpdatingTargets) {
      return true;
    }

    return false;
  }, [isUpdateMode, isMultiplatformMode, isDualOutputMode, isUpdatingTargets]);

  const headerText = useMemo(() => {
    if (error) {
      if (checklist.startVideoTransmission === 'done') {
        return $t('Your stream has started, but there were issues with other actions taken');
      } else {
        return $t('Something went wrong');
      }
    }
    if (lifecycle === 'live') {
      return $t("You're live!");
    }
    return $t('Working on your live stream') + '...';
  }, [error, checklist.startVideoTransmission, lifecycle]);

  const multistreamItemText = useMemo(() => {
    if (isLiveOutputEditingEnabled) {
      return $t('Configure the Live Output Editing service');
    }

    if (isStreamShiftMode) {
      return $t('Configure the Stream Shift service');
    }

    return $t('Configure the Multistream service');
  }, [isLiveOutputEditingEnabled, isStreamShiftMode]);

  /**
   * Renders a Timeline item in one of 4 states - 'not-started', 'pending', 'done', 'error'
   */
  function renderCheck(title: string, state: TGoLiveChecklistItemState) {
    let dot;
    let color;
    switch (state) {
      case 'not-started':
        dot = null;
        color = 'grey';
        break;
      case 'pending':
        color = 'orange';
        dot = <LoadingOutlined spin={false} color={color} />;
        break;
      case 'done':
        color = 'green';
        dot = <CheckCircleOutlined color={color} />;
        break;
      case 'failed':
        color = '#B14334'; // var(--red)
        dot = <CloseCircleOutlined color={color} />;
        break;
    }

    return (
      <Timeline.Item
        key={title}
        dot={dot}
        color={color}
        className={state === 'done' ? css.done : ''}
      >
        <span>{title}</span>
      </Timeline.Item>
    );
  }

  function renderYtWarning() {
    return (
      <MessageLayout>
        <p>
          {$t(
            'Auto-start is disabled for your broadcast. You should manually publish your stream from Youtube Studio',
          )}
        </p>
        <button
          className="button button--default"
          onClick={() => Services.YoutubeService.actions.openDashboard()}
        >
          {$t('Open Youtube Studio')}
        </button>
      </MessageLayout>
    );
  }

  return render();
}
