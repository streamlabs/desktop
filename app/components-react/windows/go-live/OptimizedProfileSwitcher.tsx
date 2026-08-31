import React from 'react';
import { useGoLiveSettings } from './useGoLiveSettings';
import { $t } from '../../../services/i18n';
import { CheckboxInput } from '../../shared/inputs';
import { Services } from '../../service-provider';
import InputWrapper from '../../shared/inputs/InputWrapper';
import { inject, injectQuery } from 'slap';
import { VideoEncodingOptimizationService } from '../../../app-services';

export default function OptimizedProfileSwitcher() {
  const {
    game,
    enabled,
    setEnabled,
    label,
    tooltip,
    optimizedProfileQuery,
  } = useGoLiveSettings().extend(settings => {
    const optimizationService = inject(VideoEncodingOptimizationService);

    async function fetchProfile(game: string) {
      const optimizedProfile = await optimizationService.actions.return.fetchOptimizedProfile(game);
      settings.updateSettings({ optimizedProfile });
    }

    const optimizedProfileQuery = injectQuery(fetchProfile, () => settings.game);

    return {
      optimizedProfileQuery,

      get enabled() {
        return optimizationService.state.useOptimizedProfile;
      },

      setEnabled(enabled: boolean) {
        optimizationService.actions.useOptimizedProfile(enabled);
      },

      tooltip: $t(
        'Optimized encoding provides better quality and/or lower cpu/gpu usage. Depending on the game, resolution may be changed for a better quality of experience',
      ),

      get label(): string {
        return settings.state.optimizedProfile?.game &&
          settings.state.optimizedProfile?.game !== 'DEFAULT'
          ? $t('Use optimized encoder settings for %{game}', { game })
          : $t('Use optimized encoder settings');
      },
    };
  });

  return (
    <InputWrapper>
      {optimizedProfileQuery.isLoading && $t('Checking optimized setting for %{game}', { game })}
      {!optimizedProfileQuery.isLoading && (
        <CheckboxInput value={enabled} onChange={setEnabled} label={label} tooltip={tooltip} />
      )}
    </InputWrapper>
  );
}
