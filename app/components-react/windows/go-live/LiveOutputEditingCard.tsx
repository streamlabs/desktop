import React, { useCallback, useMemo } from 'react';
import { useGoLiveSettings } from './useGoLiveSettings';
import { Services } from 'components-react/service-provider';
import { SwitcherCard } from './SwitcherCard';
import UltraIcon from 'components-react/shared/UltraIcon';
import { $t } from 'services/i18n';
import styles from './GoLive.m.less';

export default function LiveOutputEditingCard() {
  const {
    isLiveOutputEditingEnabled,
    isLiveOutputEditingDisabled,
    isPrime,
    isStreamShiftMode,
    setLiveOutputEditingEnabled,
  } = useGoLiveSettings();

  const liveOutputTooltip = useMemo(() => {
    if (!isPrime) {
      return $t('Upgrade to Ultra to manage live outputs mid-stream');
    }

    if (isStreamShiftMode) {
      return $t('Live Output Editing cannot be used with Stream Shift');
    }

    return $t('Update your live outputs mid-stream');
  }, [isPrime, isStreamShiftMode]);

  const tooltipDisabled = useMemo(() => {
    return isPrime && !isStreamShiftMode;
  }, [isPrime, isStreamShiftMode]);

  const handleToggleLiveOutputEditing = useCallback(
    (status?: boolean) => {
      if (!isPrime) {
        Services.MagicLinkService.actions.linkToPrime('slobs-live-output-editing', {
          event: 'LiveOutputEditing',
        });
        return;
      }

      // A disabled card still receives the click, so stop here rather than switching on a feature
      // that is mutually exclusive with stream shift
      if (isLiveOutputEditingDisabled) return;

      setLiveOutputEditingEnabled(status ?? !isLiveOutputEditingEnabled);
      Services.UsageStatisticsService.actions.recordAnalyticsEvent('LiveOutputEditing', {
        toggle: status ?? !isLiveOutputEditingEnabled,
      });
    },
    [setLiveOutputEditingEnabled, isLiveOutputEditingEnabled, isLiveOutputEditingDisabled],
  );

  return (
    <SwitcherCard
      onClick={() => handleToggleLiveOutputEditing()}
      value={isLiveOutputEditingEnabled}
      title={
        <>
          {$t('Live output editing')}
          {!isPrime && <UltraIcon type="badge" style={{ marginLeft: '5px' }} />}
        </>
      }
      name="liveOutput"
      description={$t('Manage output destinations mid-stream.')}
      icon="icon-output"
      disabled={isLiveOutputEditingDisabled}
      switchTooltip={liveOutputTooltip}
      switchTooltipDisabled={tooltipDisabled}
      iconClassName={!isPrime ? styles.ultraIcon : undefined}
    />
  );
}
