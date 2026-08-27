import React, { useCallback, useMemo } from 'react';
import { useGoLiveSettings } from './useGoLiveSettings';
import { Services } from 'components-react/service-provider';
import { SwitcherCard } from './SwitcherCard';
import UltraIcon from 'components-react/shared/UltraIcon';
import { $t } from 'services/i18n/i18n';
import styles from './GoLive.m.less';
import cx from 'classnames';
import { shell } from '@electron/remote';

export default function StreamShiftCard() {
  const { isStreamShiftMode, isPrime, setStreamShift, isStreamShiftDisabled } = useGoLiveSettings();

  const tooltipDisabled = !isStreamShiftDisabled;

  const handleToggleStreamShift = useCallback(
    (status?: boolean) => {
      if (!isPrime) {
        Services.MagicLinkService.actions.linkToPrime('slobs-streamswitcher', {
          event: 'StreamShift',
        });
        return;
      }

      // A disabled card still receives the click, so stop here rather than switching on a feature
      // that is mutually exclusive with live output editing
      if (isStreamShiftDisabled) return;

      setStreamShift(status ?? !isStreamShiftMode);
      Services.UsageStatisticsService.actions.recordAnalyticsEvent('StreamShift', {
        toggle: status ?? !isStreamShiftMode,
      });
    },
    [setStreamShift, isStreamShiftMode, isStreamShiftDisabled, isPrime],
  );

  return (
    <SwitcherCard
      onClick={() => handleToggleStreamShift()}
      value={isStreamShiftDisabled ? false : isStreamShiftMode}
      title={
        <>
          {$t('Stream Shift')}
          {!isPrime && <UltraIcon type="badge" style={{ marginLeft: '5px' }} />}
        </>
      }
      name="streamShift"
      description={$t('Switch between devices while live.')}
      icon="icon-repeat-2"
      iconClassName={!isPrime ? styles.ultraIcon : undefined}
      disabled={isStreamShiftDisabled}
      switchTooltip={<StreamShiftTooltip />}
      switchTooltipDisabled={tooltipDisabled}
    />
  );
}

function StreamShiftTooltip() {
  const {
    isPrime,
    isDualOutputMode,
    isPatreonEnabled,
    isStreamShiftMode,
    isLiveOutputEditingEnabled,
    showTooltip,
  } = useGoLiveSettings().extend(module => ({
    get showTooltip() {
      if (module.isPatreonEnabled) return true;
      if (!module.isPrime) return true;
      if (module.isStreamShiftMode) return false;
      if (module.isLiveOutputEditingEnabled) return true;
      if (module.isDualOutputMode) return true;
      return false;
    },
  }));

  const tooltipText = useMemo(() => {
    if (!isPrime) {
      return { name: 'non-ultra', text: $t('Upgrade to Ultra to switch streams between devices.') };
    }

    if (isDualOutputMode) {
      return { name: 'dual-output', text: $t('Stream Shift cannot be used with Dual Output') };
    }

    if (isPatreonEnabled) {
      return { name: 'patreon', text: $t('Stream Shift cannot be used with Patreon') };
    }

    if (isLiveOutputEditingEnabled) {
      return {
        name: 'live-output',
        text: $t('Stream Shift cannot be used with Live Output Editing'),
      };
    }

    return { name: 'default', text: '' };
  }, [isPrime, isPatreonEnabled, isDualOutputMode, isStreamShiftMode, isLiveOutputEditingEnabled]);

  function handleTooltipClick() {
    shell.openExternal(
      'https://streamlabs.com/content-hub/post/how-to-use-streamlabs-stream-shift',
    );
  }

  return showTooltip ? (
    <span data-name={tooltipText.name}>{tooltipText.text}</span>
  ) : (
    <span data-name="explanation" onClick={handleTooltipClick}>
      {$t(
        'Stay uninterrupted by switching between devices mid stream. Works between Desktop and Mobile App.',
      )}
      <a style={{ marginLeft: 4 }}>{$t('Learn More')}</a>
    </span>
  );
}
