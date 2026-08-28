import React, { CSSProperties, useCallback, useMemo } from 'react';
import { $t } from 'services/i18n';
import { RadioInput } from './inputs';
import { TDisplayType } from 'services/settings-v2';
import { platformLabels, TPlatform } from 'services/platforms';
import { useGoLiveSettings } from 'components-react/windows/go-live/useGoLiveSettings';
import { TDisplayOutput } from 'services/streaming';
import { ICustomRadioOption } from './inputs/RadioInput';

interface IDisplaySelectorProps {
  title: string;
  index: number;
  platform: TPlatform | null;
  destinationName?: string;
  className?: string;
  style?: CSSProperties;
  nolabel?: boolean;
  alignIcons?: 'left' | 'center' | 'right';
  disabled?: boolean;
}

export default function DisplaySelector(p: IDisplaySelectorProps) {
  const {
    display,
    canDualStream,
    updateCustomDestinationDisplayAndSaveSettings,
    updatePlatformDisplayAndSaveSettings,
    isLiveOutputEditingEnabled,
    isUpdateMode,
    isLive,
  } = useGoLiveSettings().extend(module => ({
    get canDualStream() {
      if (!p.platform) return false;
      return module.getCanDualStream(p.platform);
    },

    get isLive(): boolean {
      return (
        module.isUpdateMode &&
        module.isLiveOutputEditingEnabled &&
        !!module.isTargetLive(p.platform ?? p.index)
      );
    },

    get display(): TDisplayOutput {
      const defaultDisplay = p.platform
        ? module.settings.platforms[p.platform]?.display
        : module.settings.customDestinations[p.index]?.display;

      if (defaultDisplay === 'both' && (!this.canDualStream || isLiveOutputEditingEnabled)) {
        return 'horizontal';
      }

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

    if (isLive) {
      // A live target cannot change display without restarting its stream, so offer only the
      // display it is already using and explain how to change it
      const activeDisplay =
        defaultDisplays.find(option => option.value === display) ?? defaultDisplays[0];

      return [
        {
          ...activeDisplay,
          disabled: true,
          tooltip: $t(
            'Go offline to change orientation, then select a new resolution and go live again',
          ),
        },
      ];
    }

    if (isUpdateMode) {
      // Don't show Dual stream option in the Edit Stream window because it is not compatible with
      // live output editing, which is the only time the display toggles are shown in the update window
      return defaultDisplays;
    }

    if (canDualStream) {
      const tooltip = isLiveOutputEditingEnabled
        ? $t('Dual Stream is not available while live output editing is enabled')
        : $t('Stream both horizontally and vertically to %{platform}', {
            platform: platformLabels(p.platform!),
          });

      return [
        ...defaultDisplays,
        {
          label: $t('Both'),
          value: 'both' as TDisplayType,
          icon: 'icon-dual-output',
          tooltip,
          disabled: isLiveOutputEditingEnabled,
        },
      ];
    }

    return defaultDisplays;
  }, [canDualStream, isLiveOutputEditingEnabled, isUpdateMode, isLive, display, p.platform]);

  const onChange = useCallback(
    (val: string) => {
      const updatedDisplay = val as TDisplayOutput;
      if (p.platform) {
        updatePlatformDisplayAndSaveSettings(p.platform, updatedDisplay);
      } else {
        if (updatedDisplay === 'both') {
          // There's no UI that would allow for this, but just in case
          throw new Error('Attempted to update custom display for dual stream, this is impossible');
        }
        updateCustomDestinationDisplayAndSaveSettings(p.index, updatedDisplay as TDisplayType);
      }
    },
    [
      p.platform,
      p.index,
      updatePlatformDisplayAndSaveSettings,
      updateCustomDestinationDisplayAndSaveSettings,
    ],
  );

  // Convert displays array to Dictionary<TInputValue>
  const displayDict = useMemo(() => {
    return displays.reduce((acc: Dictionary<ICustomRadioOption>, curr) => {
      acc[curr.value] = curr;
      return acc;
    }, {} as Dictionary<ICustomRadioOption>);
  }, [displays]);

  const name = `${p.platform || p.destinationName}Display`;
  const value = displayDict[display]?.value || 'horizontal';

  return (
    <RadioInput
      nolabel={p?.nolabel}
      label={p?.nolabel ? undefined : p.title}
      name={name}
      value={value}
      defaultValue="horizontal"
      options={displays}
      alignIcons={p?.alignIcons}
      onChange={onChange}
      icons={true}
      className={p?.className}
      style={p?.style}
      direction="horizontal"
      gapsize={0}
      nowrap
      optionType="button"
      disabled={p?.disabled}
    />
  );
}
