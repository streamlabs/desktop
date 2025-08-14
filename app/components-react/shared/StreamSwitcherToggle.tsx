import React, { CSSProperties, useEffect } from 'react';
import styles from './StreamSwitcherToggle.m.less';
import Tooltip from 'components-react/shared/Tooltip';
import { CheckboxInput } from 'components-react/shared/inputs';
import cx from 'classnames';
import { $t } from 'services/i18n';
import { useGoLiveSettings } from 'components-react/windows/go-live/useGoLiveSettings';
import UltraIcon from './UltraIcon';
interface IStreamSwitcherToggle {
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
}

export default function StreamSwitcherToggle(p: IStreamSwitcherToggle) {
  const { isDualOutputMode, isPrime, isStreamSwitchMode, setStreamSwitcher } = useGoLiveSettings();

  const label = $t('Toggle Stream Switcher');

  return (
    <div className={cx(p?.className, styles.streamSwitcherToggle)} style={p?.style}>
      <CheckboxInput
        label={label}
        value={isStreamSwitchMode}
        onChange={setStreamSwitcher}
        disabled={p?.disabled}
      />

      {!isPrime ? (
        <UltraIcon type="badge" style={{ marginLeft: '10px' }} />
      ) : (
        <Tooltip
          title={$t('Toggle to swap your stream between Desktop and Mobile devices.')}
          placement="top"
          lightShadow={true}
          disabled={p?.disabled}
        >
          <i className="icon-information" style={{ marginLeft: '10px' }} />
        </Tooltip>
      )}
    </div>
  );
}
