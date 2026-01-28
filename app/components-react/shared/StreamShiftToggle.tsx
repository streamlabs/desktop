import React, { CSSProperties, useEffect } from 'react';
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
  const { isPrime, isStreamShiftMode, setStreamShift } = useGoLiveSettings();

  useEffect(() => {
    // Ensure that non-ultra users have the stream switcher disabled
    if (!isPrime && isStreamShiftMode) {
      setStreamShift(false);
    }
  }, [isPrime, isStreamShiftMode]);

  const label = $t('Stream Shift');

  function handleTooltipClick() {
    shell.openExternal(
      'https://streamlabs.com/content-hub/post/how-to-use-streamlabs-stream-shift',
    );
  }

  return (
    <div className={styles.streamShiftWrapper}>
      <div className={cx(p?.className, styles.streamShiftToggle)} style={p?.style}>
        <CheckboxInput
          className={p?.checkboxClassname}
          label={
            !isPrime ? (
              <div
                className={styles.labelUltraBadge}
                onClick={() => {
                  Services.MagicLinkService.actions.linkToPrime(
                    'slobs-streamswitcher',
                    'StreamShift',
                  );
                }}
              >
                <UltraIcon type="badge" style={{ marginRight: '5px' }} />
                {label}
              </div>
            ) : (
              <>{label}</>
            )
          }
          name="streamShift"
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
          title={
            <span onClick={handleTooltipClick}>
              {$t(
                'Stay uninterrupted by switching between devices mid stream. Works between Desktop and Mobile App.',
              )}
              <a style={{ marginLeft: 4 }}>{$t('Learn More')}</a>
            </span>
          }
          placement="top"
          lightShadow={true}
          disabled={p?.disabled}
        >
          <i className="icon-information" style={{ marginLeft: '10px' }} />
        </Tooltip>
      </div>
      <Badge className={styles.betaBadge} content={'Beta'} />
    </div>
  );
}
