import React, { CSSProperties } from 'react';
import { $t } from 'services/i18n';
import { RadioInput } from './inputs';
import { TDisplayType } from 'services/settings-v2';
import { TPlatform } from 'services/platforms';
import { useGoLiveSettings } from 'components-react/windows/go-live/useGoLiveSettings';
import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';

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
    isPrime,
    enabledPlatforms,
    updateShouldUseExtraOutput,
  } = useGoLiveSettings();

  // TODO: find a way to integrate into goLiveSettings that's reactive (currently not working that way)
  const { hasExtraOutput } = useVuex(() => ({
    hasExtraOutput: Services.DualOutputService.views.hasExtraOutput(p.platform!),
  }));

  const setting = p.platform ? platforms[p.platform] : customDestinations[p.index];

  // If the user has Ultra, add extra output for YT, if not, check that we only have
  // a single platform enabled, hopefully YouTube.
  // Might need better validation.
  const supportsExtraOutputs =
    p.platform === 'youtube' && (isPrime || enabledPlatforms.length === 1);

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

  if (supportsExtraOutputs) {
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
        supportsExtraOutputs && val === 'both' ? 'horizontal' : (val as TDisplayType);
      updatePlatform(p.platform, { display });

      // Add or remove the platform from the Dual Output's extra output platforms list
      updateShouldUseExtraOutput(p.platform, val);
    } else {
      updateCustomDestinationDisplay(p.index, val as TDisplayType);
    }
  };

  // TODO: Fake accessor, improve, if nothing else, fix type
  const value = setting?.display === 'horizontal' && hasExtraOutput ? 'both' : setting?.display;

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
