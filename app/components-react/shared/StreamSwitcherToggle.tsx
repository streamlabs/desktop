import React, { CSSProperties } from 'react';
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
}

export default function StreamSwitcherToggle(p: IStreamSwitcherToggle) {
  const { isDualOutputMode, isPrime, isStreamSwitchMode, setStreamSwitcher } = useGoLiveSettings();

  const label = isStreamSwitchMode ? $t('Disable Stream Switcher') : $t('Enable Stream Switcher');

  return (
    <div className={cx(p?.className, styles.streamSwitcherToggle)} style={p?.style}>
      <CheckboxInput
        label={label}
        value={isStreamSwitchMode}
        onChange={setStreamSwitcher}
        disabled={isDualOutputMode || !isPrime}
      />
      {!isPrime && <UltraIcon type="badge" />}
      <Tooltip
        title={$t('Toggle to swap your stream between Desktop and Mobile devices.')}
        placement="top"
        lightShadow={true}
      >
        <i className="icon-information" />
      </Tooltip>
    </div>
  );
}
