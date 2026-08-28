import React, { CSSProperties, useCallback, useMemo } from 'react';
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

/**
 * @deprecated This checkbox is currently no longer used but kept for legacy purposes.
 */
export default function StreamShiftToggle(p: IStreamShiftToggle) {
  const {
    isPrime,
    isStreamShiftMode,
    setStreamShift,
    isStreamShiftEnabled,
    disableToggle,
  } = useGoLiveSettings().extend(module => ({
    get isStreamShiftEnabled() {
      if (module.isLiveOutputEditingEnabled) return false;
      if (module.isPatreonEnabled) return false;
      return module.isStreamShiftMode;
    },
    get disableToggle() {
      if (p?.disabled === true) return true;
      if (!module.isPrime) return true;
      if (module.isPatreonEnabled) return true;
      if (module.isLiveOutputEditingEnabled) return true;
      if (module.isDualOutputMode) return true;
      return module.isStreamShiftDisabled;
    },
  }));

  const label = $t('Stream Shift');

  const handleToggleStreamShift = useCallback(
    (status?: boolean) => {
      if (disableToggle) return;
      const newStatus = status ?? !isStreamShiftMode;
      setStreamShift(newStatus);
      Services.UsageStatisticsService.actions.recordAnalyticsEvent('StreamShift', {
        toggle: newStatus,
      });
    },
    [isStreamShiftMode, disableToggle, setStreamShift],
  );

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
          value={disableToggle ? false : isStreamShiftEnabled}
          onChange={handleToggleStreamShift}
          disabled={p?.disabled ?? disableToggle}
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
    isLiveOutputEditingEnabled,
    showTooltip,
  } = useGoLiveSettings().extend(module => ({
    get showTooltip() {
      if (module.isPatreonEnabled) return true;
      if (!module.isPrime) return true;
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
  }, [isPrime, isPatreonEnabled, isDualOutputMode, isLiveOutputEditingEnabled]);

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
