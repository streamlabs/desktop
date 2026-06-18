import React from 'react';
import { IWidgetCommonState, useWidget, WidgetModule } from './common/useWidget';
import { WidgetLayout } from './common/WidgetLayout';
import InputWrapper from '../shared/inputs/InputWrapper';
import { $t } from '../../services/i18n';
import { CheckboxInput, ColorInput, FontFamilyInput, FontSizeInput } from '../shared/inputs';

interface IViewerCountState extends IWidgetCommonState {
  data: {
    settings: {
      font: string;
      font_color: string;
      font_size: number;
      font_weight: number;
      twitch: boolean;
      youtube: boolean;
      facebook: boolean;
    };
  };
}

export function ViewerCount() {
  const { isLoading, bind } = useViewerCount();
  // use 1 column layout
  return (
    <WidgetLayout>
      {!isLoading && (
        <>
          <InputWrapper label={$t('Enabled Streams')}>
            <CheckboxInput label={$t('Twitch Viewers')} {...bind.twitch} />
            <CheckboxInput label={$t('YouTube Viewers')} {...bind.youtube} />
            <CheckboxInput label={$t('Facebook Viewers')} {...bind.facebook} />
          </InputWrapper>

          <FontFamilyInput label={$t('Font')} {...bind.font} />
          <ColorInput label={$t('Font Color')} {...bind.font_color} />
          <FontSizeInput label={$t('Font Size')} {...bind.font_size} debounce={500} />
        </>
      )}
    </WidgetLayout>
  );
}

export class ViewerCountModule extends WidgetModule<IViewerCountState> {
  patchAfterFetch(data: any): IViewerCountState {
    // transform platform types to simple booleans
    return {
      ...data,
      settings: {
        ...data.settings,
        twitch: data.settings.types.twitch.enabled,
        youtube: data.settings.types.youtube.enabled,
        facebook: data.settings.types.facebook.enabled,
      },
    };
  }

  patchBeforeSend(settings: IViewerCountState['data']['settings']): any {
    // the API accepts an object instead of simple booleans for platforms
    return {
      ...settings,
      types: {
        youtube: { enabled: settings.youtube },
        twitch: { enabled: settings.twitch },
        facebook: { enabled: settings.facebook },
      },
    };
  }
}

function useViewerCount() {
  return useWidget<ViewerCountModule>();
}
