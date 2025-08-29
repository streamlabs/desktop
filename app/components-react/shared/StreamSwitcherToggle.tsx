import React, { CSSProperties, useEffect } from 'react';
import styles from './StreamSwitcherToggle.m.less';
import Tooltip from 'components-react/shared/Tooltip';
import { CheckboxInput } from 'components-react/shared/inputs';
import cx from 'classnames';
import { $t } from 'services/i18n';
import { useGoLiveSettings } from 'components-react/windows/go-live/useGoLiveSettings';
import UltraIcon from './UltraIcon';
import { Services } from '../service-provider';
interface IStreamSwitcherToggle {
  className?: string;
  checkboxClassname?: string;
  style?: CSSProperties;
  disabled?: boolean;
}

export default function StreamSwitcherToggle(p: IStreamSwitcherToggle) {
  const { isPrime, isStreamSwitchMode, setStreamSwitcher } = useGoLiveSettings();

  useEffect(() => {
    // Ensure that non-ultra users have the stream switcher disabled
    if (!isPrime && isStreamSwitchMode) {
      setStreamSwitcher(false);
    }
  }, [isPrime, isStreamSwitchMode, setStreamSwitcher]);

  const label = $t('Stream Switcher');

  return (
    <div className={cx(p?.className, styles.streamSwitcherToggle)} style={p?.style}>
      <CheckboxInput
        className={p?.checkboxClassname}
        label={
          !isPrime ? (
            <div
              className={styles.labelUltraBadge}
              onClick={() => {
                Services.UsageStatisticsService.actions.recordAnalyticsEvent(
                  'StreamSwitcherAction',
                  {
                    ultra: 'go-live-switcher',
                  },
                );
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
        value={isStreamSwitchMode}
        onChange={(status: boolean) => {
          setStreamSwitcher(status);
          Services.UsageStatisticsService.actions.recordAnalyticsEvent('StreamSwitcherAction', {
            toggle: status,
          });
        }}
        disabled={p?.disabled}
      />

      <Tooltip
        title={$t(
          'Stay uninterrupted by switching between devices mid stream. Works between Desktop, Mobile App & Console.',
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
