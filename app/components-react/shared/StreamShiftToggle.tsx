import React, { CSSProperties, useEffect, useMemo } from 'react';
import { shell } from '@electron/remote';
import styles from './StreamShiftToggle.m.less';
import Tooltip from 'components-react/shared/Tooltip';
import { CheckboxInput } from 'components-react/shared/inputs';
import cx from 'classnames';
import { $t } from 'services/i18n';
import { useGoLiveSettings } from 'components-react/windows/go-live/useGoLiveSettings';
import UltraIcon from './UltraIcon';
import { Services } from '../service-provider';
import Badge from 'components-react/shared/DismissableBadge';
interface IStreamShiftToggle {
  className?: string;
  checkboxClassname?: string;
  style?: CSSProperties;
  disabled?: boolean;
}

export default function StreamShiftToggle(p: IStreamShiftToggle) {
  const {
    isPrime,
    isStreamShiftMode,
    setStreamShift,
    isDualOutputMode,
    isPatreonEnabled,
    isStreamShiftDisabled,
    forceStreamShiftToggleEnabled,
  } = useGoLiveSettings();

  useEffect(() => {
    // Ensure that non-ultra users have the stream switcher disabled
    if (!isPrime && isStreamShiftMode) {
      setStreamShift(false);
    }
  }, [isPrime, isStreamShiftMode]);

  const label = $t('Stream Shift');

  function handleToggleStreamShift(status?: boolean) {
    if (disableToggle) return;
    const newStatus = status ?? !isStreamShiftMode;
    setStreamShift(newStatus);
    Services.UsageStatisticsService.actions.recordAnalyticsEvent('StreamShift', {
      toggle: newStatus,
    });
  }

  const isStreamShiftEnabled = useMemo(() => {
    return isPatreonEnabled ? false : isStreamShiftMode;
  }, [isPatreonEnabled, isStreamShiftMode]);

  const disableToggle = useMemo(() => {
    if (p?.disabled) return true;
    if (!isPrime) return true;
    if (isPatreonEnabled) return true;
    if (isDualOutputMode && !forceStreamShiftToggleEnabled) return true;
    return isStreamShiftDisabled;
  }, [
    p?.disabled,
    isPatreonEnabled,
    isDualOutputMode,
    forceStreamShiftToggleEnabled,
    isPrime,
    isStreamShiftDisabled,
  ]);

  return (
    <div className={styles.streamShiftWrapper}>
      <div className={cx(p?.className, styles.streamShiftToggle)} style={p?.style}>
        <CheckboxInput
          className={p?.checkboxClassname}
          label={
            !isPrime ? (
              <div
                data-name="shift-ultra-icon"
                className={styles.labelUltraBadge}
                onClick={() => {
                  Services.MagicLinkService.actions.linkToPrime('slobs-streamswitcher', {
                    event: 'StreamShift',
                  });
                }}
              >
                <UltraIcon type="badge" className={styles.ultraIcon} />
                <div className={cx(styles.labelCheckbox, styles.ultra)}>{label}</div>
              </div>
            ) : (
              <div className={styles.labelCheckbox} onClick={() => handleToggleStreamShift()}>
                {label}
              </div>
            )
          }
          name="streamShift"
          value={isStreamShiftEnabled}
          onChange={handleToggleStreamShift}
          disabled={disableToggle}
        />

        <Tooltip
          title={<StreamShiftTooltip />}
          placement="top"
          lightShadow={true}
          className={styles.tooltip}
        >
          <i className="icon-information" />
        </Tooltip>
      </div>
      <Badge className={styles.betaBadge} content={'Beta'} />
    </div>
  );
}

function StreamShiftTooltip() {
  const {
    isPrime,
    isDualOutputMode,
    isPatreonEnabled,
    forceStreamShiftToggleEnabled,
  } = useGoLiveSettings();

  const tooltipText = useMemo(() => {
    if (!isPrime) {
      return { name: 'not-ultra', text: $t('Upgrade to Ultra to switch streams between devices.') };
    }

    if (isPatreonEnabled) {
      return { name: 'patreon', text: $t('Stream Shift cannot be used with Patreon') };
    }

    if (isDualOutputMode && !forceStreamShiftToggleEnabled) {
      return { name: 'dual-output', text: $t('Stream Shift cannot be used with Dual Output') };
    }

    return { name: 'default', text: '' };
  }, [isPrime, isPatreonEnabled, isDualOutputMode, forceStreamShiftToggleEnabled]);

  const showTextTooltip = useMemo(() => {
    if (isPatreonEnabled) return true;
    if (!isPrime) return true;
    if (isDualOutputMode && !forceStreamShiftToggleEnabled) return true;
    return false;
  }, [isPrime, isPatreonEnabled, isDualOutputMode, forceStreamShiftToggleEnabled]);

  function handleTooltipClick() {
    shell.openExternal(
      'https://streamlabs.com/content-hub/post/how-to-use-streamlabs-stream-shift',
    );
  }

  return showTextTooltip ? (
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
