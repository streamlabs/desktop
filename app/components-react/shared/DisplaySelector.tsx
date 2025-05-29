import React, { CSSProperties, useMemo } from 'react';
import { $t } from 'services/i18n';
import { RadioInput } from './inputs';
import { TDisplayType } from 'services/settings-v2';
import { TPlatform } from 'services/platforms';
import { useGoLiveSettings } from 'components-react/windows/go-live/useGoLiveSettings';
import { TDisplayOutput } from 'services/streaming/streaming-api';

interface IDisplaySelectorProps {
  title: string;
  index: number;
  platform: TPlatform | null;
  className?: string;
  style?: CSSProperties;
  nolabel?: boolean;
}

export default function DisplaySelector(p: IDisplaySelectorProps) {
  const {
    display,
    canDualStream,
    updateCustomDestinationDisplay,
    updatePlatform,
  } = useGoLiveSettings().extend(module => ({
    get canDualStream() {
      if (!p.platform || !module.isPrime) return false;
      return module.getCanDualStream(p.platform);
    },

    get display(): TDisplayOutput {
      const defaultDisplay = p.platform
        ? module.settings.platforms[p.platform]?.display
        : module.settings.customDestinations[p.index]?.display;

      return defaultDisplay ?? 'horizontal';
    },
  }));

  const displays = useMemo(() => {
    const defaultDisplays = [
      {
        label: $t('Horizontal'),
        value: 'horizontal',
      },
      {
        label: $t('Vertical'),
        value: 'vertical',
      },
    ];

    if (canDualStream) {
      defaultDisplays.push({
        label: $t('Both'),
        value: 'both' as TDisplayType,
      });
    }

    return defaultDisplays;
  }, [canDualStream]);

  const onChange = (val: TDisplayType | 'both') => {
    console.log('onChange val', val);

    if (p.platform) {
      updatePlatform(p.platform, { display: val });
    } else {
      updateCustomDestinationDisplay(p.index, val as TDisplayType);
    }
  };

  return (
    <RadioInput
      nolabel={p?.nolabel}
      label={p?.nolabel ? undefined : p.title}
      data-test="display-input"
      id={`${p.platform}-display-input`}
      direction="horizontal"
      gapsize={0}
      defaultValue="horizontal"
      options={displays}
      onChange={onChange}
      value={display}
      className={p?.className}
      style={p?.style}
    />
  );
}
