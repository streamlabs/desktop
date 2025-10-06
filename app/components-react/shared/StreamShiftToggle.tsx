import React, { CSSProperties, useEffect } from 'react';
import styles from './StreamShiftToggle.m.less';
import Tooltip from 'components-react/shared/Tooltip';
import { CheckboxInput } from 'components-react/shared/inputs';
import cx from 'classnames';
import { $t } from 'services/i18n';
import { useGoLiveSettings } from 'components-react/windows/go-live/useGoLiveSettings';
import UltraIcon from './UltraIcon';
import { Services } from '../service-provider';
interface IStreamShiftToggle {
  className?: string;
  checkboxClassname?: string;
  style?: CSSProperties;
  disabled?: boolean;
}

export default function StreamShiftToggle(p: IStreamShiftToggle) {
  const { isPrime, isStreamShiftMode, setStreamShift } = useGoLiveSettings();

  useEffect(() => {
    // Ensure that non-ultra users have the stream switcher disabled
    if (!isPrime && isStreamShiftMode) {
      setStreamShift(false);
    }
  }, [isPrime, isStreamShiftMode, setStreamShift]);

  const label = $t('Stream Shift');

  return (
    <div className={cx(p?.className, styles.streamShiftToggle)} style={p?.style}>
      <CheckboxInput
        className={p?.checkboxClassname}
        label={
          !isPrime ? (
            <div
              className={styles.labelUltraBadge}
              onClick={() => {
                Services.UsageStatisticsService.actions.recordAnalyticsEvent('StreamShift', {
                  ultra: 'go-live-toggle',
                });
                Services.MagicLinkService.actions.linkToPrime('slobs-streamswitcher');
              }}
            >
              <UltraIcon type="badge" style={{ marginRight: '5px' }} />
              {label}
            </div>
          ) : (
            <>{label}</>
          )
        }
        value={isStreamShiftMode}
        onChange={(status: boolean) => {
          setStreamShift(status);
          Services.UsageStatisticsService.actions.recordAnalyticsEvent('StreamShift', {
            toggle: status,
          });
        }}
        disabled={p?.disabled}
      />

      <Tooltip
        title={$t(
          'Stay uninterrupted by switching between devices mid stream. Works between Desktop and Mobile App.',
        )}
        placement="top"
        lightShadow={true}
        disabled={p?.disabled}
      >
        <i className="icon-information" style={{ marginLeft: '10px' }} />
      </Tooltip>
    </div>
  );
}
