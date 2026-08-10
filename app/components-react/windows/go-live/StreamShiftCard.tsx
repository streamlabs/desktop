import React, { useCallback, useMemo } from 'react';
import { TInputLayout } from 'components-react/shared/inputs';
import { useGoLiveSettings } from './useGoLiveSettings';
import { Services } from 'components-react/service-provider';
import { SwitcherCard } from './SwitcherCard';
import UltraIcon from 'components-react/shared/UltraIcon';
import { $t } from 'services/i18n/i18n';
import styles from './GoLive.m.less';
import { shell } from '@electron/remote';

export default function StreamShiftCard() {
  const {
    isStreamShiftMode,
    isPrime,
    setStreamShift,
    isLiveOutputEditingEnabled,
  } = useGoLiveSettings();

  const handleToggleStreamShift = useCallback(
    (status?: boolean) => {
      if (!isPrime) {
        Services.MagicLinkService.actions.linkToPrime('slobs-streamswitcher', {
          event: 'StreamShift',
        });
        return;
      }

      setStreamShift(status ?? !isStreamShiftMode);
      Services.UsageStatisticsService.actions.recordAnalyticsEvent('StreamShift', {
        toggle: status ?? !isStreamShiftMode,
      });
    },
    [setStreamShift, isStreamShiftMode],
  );

  return (
    <SwitcherCard
      onClick={() => handleToggleStreamShift()}
      value={isLiveOutputEditingEnabled ? false : isStreamShiftMode}
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
      tooltip={<StreamShiftTooltip />}
      disabled={isLiveOutputEditingEnabled}
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
    forceStreamShiftToggleEnabled,
    showTooltip,
  } = useGoLiveSettings().extend(module => ({
    get showTooltip() {
      if (module.isPatreonEnabled) return true;
      if (!module.isPrime) return true;
      if (module.isStreamShiftMode) return false;
      if (module.isLiveOutputEditingEnabled) return true;
      if (module.isDualOutputMode && !module.forceStreamShiftToggleEnabled) return true;
      return false;
    },
  }));

  const tooltipText = useMemo(() => {
    if (!isPrime) {
      return { name: 'non-ultra', text: $t('Upgrade to Ultra to switch streams between devices.') };
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

    if (isDualOutputMode && !forceStreamShiftToggleEnabled) {
      return { name: 'dual-output', text: $t('Stream Shift cannot be used with Dual Output') };
    }

    return { name: 'default', text: '' };
  }, [
    isPrime,
    isPatreonEnabled,
    isDualOutputMode,
    isStreamShiftMode,
    isLiveOutputEditingEnabled,
    forceStreamShiftToggleEnabled,
  ]);

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
