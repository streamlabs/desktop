import React, { CSSProperties } from 'react';
import { $t } from 'services/i18n';
import { RadioInput } from './inputs';
import { TDisplayType } from 'services/video';
import { platformLabels, TPlatform } from 'services/platforms';
import { useGoLiveSettings } from 'components-react/windows/go-live/useGoLiveSettings';
import { ICustomStreamDestination } from 'services/settings/streaming';

interface IDisplaySelectorProps {
  title: string;
  index: number;
  platform: TPlatform | null;
  label: string;
  className?: string;
  style?: CSSProperties;
}

export default function DisplaySelector(p: IDisplaySelectorProps) {
  const {
    customDestinations,
    platforms,
    updateCustomDestinationDisplay,
    updatePlatform,
  } = useGoLiveSettings();

  const setting = p.platform ? platforms[p.platform] : customDestinations[p.index];
  const label = p.platform
    ? platformLabels(p.platform)
    : (setting as ICustomStreamDestination).name;

  const displays = [
    {
      label: $t('Horizontal'),
      value: 'horizontal',
    },
    {
      label: $t('Vertical'),
      value: 'vertical',
    },
  ];

  return (
    <RadioInput
      data-test="display-input"
      id={`${p.platform}-display-input`}
      direction="horizontal"
      label={label}
      labelAlign="left"
      labelCol={{ offset: 0 }}
      colon
      gapsize={0}
      defaultValue="horizontal"
      options={displays}
      onChange={(val: TDisplayType) =>
        p.platform
          ? updatePlatform(p.platform, { display: val })
          : updateCustomDestinationDisplay(p.index, val)
      }
      value={setting?.display ?? 'horizontal'}
      className={p?.className}
      style={p?.style}
    />
  );
}
