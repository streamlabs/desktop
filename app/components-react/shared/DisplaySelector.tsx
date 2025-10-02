import React, { CSSProperties, useMemo } from 'react';
import { $t } from 'services/i18n';
import { RadioInput } from './inputs';
import { TDisplayType } from 'services/settings-v2';
import { platformLabels, TPlatform } from 'services/platforms';
import { useGoLiveSettings } from 'components-react/windows/go-live/useGoLiveSettings';
import { TDisplayOutput } from 'services/streaming';
import { IRadioMetadata } from './inputs/metadata';
import { ICustomRadioOption } from './inputs/RadioInput';

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

  const displays: ICustomRadioOption[] = useMemo(() => {
    const defaultDisplays = [
      {
        label: $t('Horizontal'),
        value: 'horizontal',
        icon: 'icon-desktop',
      },
      {
        label: $t('Vertical'),
        value: 'vertical',
        icon: 'icon-phone-case',
      },
    ];

    if (canDualStream) {
      const tooltip = p?.platform
        ? $t('Stream both horizontally and vertically to %{platform}', {
            platform: platformLabels(p.platform),
          })
        : undefined;

      return [
        ...defaultDisplays,
        {
          label: $t('Both'),
          value: 'both' as TDisplayType,
          icon: 'icon-dual-output',
          tooltip,
        },
      ];
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

  // Convert displays array to Dictionary<TInputValue>
  const displayDict = useMemo(() => {
    return displays.reduce((acc: Dictionary<IRadioMetadata>, curr) => {
      acc[curr.value] = curr;
      return acc;
    }, {} as Dictionary<IRadioMetadata>);
  }, [displays]);

  const name = `${p.platform || `custom-destination-${p.index}`}Display`;
  const value = displayDict[display]?.value || 'horizontal';

  return (
    <RadioInput
      // data-title={p.title}
      nolabel={p?.nolabel}
      label={p?.nolabel ? undefined : p.title}
      name={name}
      value={value}
      defaultValue="horizontal"
      options={displays}
      onChange={onChange}
      icons={true}
      className={p?.className}
      style={p?.style}
      direction="horizontal"
      gapsize={0}
    />
  );
}
