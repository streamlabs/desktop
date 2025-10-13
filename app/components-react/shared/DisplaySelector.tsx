import React, { CSSProperties, useMemo } from 'react';
import { $t } from 'services/i18n';
import { RadioInput } from './inputs';
import { TDisplayType } from 'services/settings-v2';
import { TPlatform } from 'services/platforms';
import { useGoLiveSettings } from 'components-react/windows/go-live/useGoLiveSettings';
import { TDisplayOutput } from 'services/streaming';

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
    updateCustomDestinationDisplayAndSaveSettings,
    updatePlatformDisplayAndSaveSettings,
  } = useGoLiveSettings().extend(module => ({
    get canDualStream() {
      if (!p.platform) return false;
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
    const defaultDisplays: { label: string; value: TDisplayOutput }[] = [
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

  const onChange = (val: TDisplayOutput) => {
    if (p.platform) {
      updatePlatformDisplayAndSaveSettings(p.platform, val);
    } else {
      if (val === 'both') {
        // There's no UI that would allow for this, but just in case
        throw new Error('Attempted to update custom display for dual stream, this is impossible');
      }
      updateCustomDestinationDisplayAndSaveSettings(p.index, val as TDisplayType);
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
