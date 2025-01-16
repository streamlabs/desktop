import React, { CSSProperties } from 'react';
import { $t } from 'services/i18n';
import { RadioInput } from './inputs';
import { TDisplayType } from 'services/settings-v2';
import { TPlatform } from 'services/platforms';
import { useGoLiveSettings } from 'components-react/windows/go-live/useGoLiveSettings';

interface IDisplaySelectorProps {
  title: string;
  index: number;
  platform: TPlatform | null;
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

  // TODO: better validation
  const hasExtraOutputs = p.platform === 'youtube';

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

  if (hasExtraOutputs) {
    // TODO: TS doesn't infer types on filter(id) so we're mutating array here
    displays.push({
      label: $t('Both'),
      value: 'both',
    });
  }

  const onChange = (val: TDisplayType | 'both') => {
    console.log('DiplaySelector onChange:', val);
    if (p.platform) {
      const display: TDisplayType =
        // Use horizontal display, vertical stream will be created separately
        hasExtraOutputs && val === 'both' ? 'horizontal' : (val as TDisplayType);
      updatePlatform(p.platform, { display, hasExtraOutputs: val === 'both' });
    } else {
      updateCustomDestinationDisplay(p.index, val as TDisplayType);
    }
  };

  // TODO: Fake accessor, improve, if nothing else, fix type
  const value =
    setting?.display === 'horizontal' && (setting as any)?.hasExtraOutputs
      ? 'both'
      : setting?.display;

  return (
    <RadioInput
      nolabel
      data-test="display-input"
      id={`${p.platform}-display-input`}
      direction="horizontal"
      gapsize={0}
      defaultValue="horizontal"
      options={displays}
      onChange={onChange}
      value={value ?? 'horizontal'}
      className={p?.className}
      style={p?.style}
    />
  );
}
