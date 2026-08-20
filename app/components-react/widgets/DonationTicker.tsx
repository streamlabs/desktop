import React from 'react';
import { IWidgetState, useWidget, WidgetModule } from './common/useWidget';
import { WidgetLayout } from './common/WidgetLayout';
import { $t } from '../../services/i18n';
import {
  ColorInput,
  FontFamilyInput,
  FontSizeInput,
  FontWeightInput,
  NumberInput,
  TextInput,
  SliderInput,
} from '../shared/inputs';

interface IDonationTickerState extends IWidgetState {
  data: {
    settings: {
      background_color: string;
      font: string;
      font_color: string;
      font_color2: string;
      font_color3: string;
      font_size: number;
      font_weight: number;
      max_donation_age: number;
      max_donations: number;
      message_format: string;
      min_donation_amount: number;
      scroll_speed: number;
    };
  };
}

export function DonationTicker() {
  const w = useDonationTicker();
  return (
    <WidgetLayout>
      {w.hasLoadedSettings() && (
        <>
          <TextInput
            label={$t('Message Format')}
            {...w.bind.message_format}
            tooltip={w.tips.messageFormatTooltip}
          />
          <NumberInput
            label={$t('Max Donations')}
            {...w.bind.max_donations}
            min={0}
            max={1000}
            tooltip={w.tips.maxDonationsTooltip}
          />
          <SliderInput
            label={$t('Text Scroll Speed')}
            {...w.bind.scroll_speed}
            max={10}
            tooltip={w.tips.scrollSpeedTooltip}
          />
          <ColorInput
            label={$t('Background Color')}
            {...w.bind.background_color}
            tooltip={w.tips.backgroundColorTooltip}
          />

          <FontFamilyInput label={$t('Font')} {...w.bind.font} />
          <FontSizeInput
            label={$t('Font Size')}
            {...w.bind.font_size}
            tooltip={w.tips.fontSizeTooltip}
          />
          <FontWeightInput
            label={$t('Font Weight')}
            {...w.bind.font_weight}
            tooltip={w.tips.fontWeightTooltip}
          />
          <ColorInput
            label={$t('Text Color')}
            {...w.bind.font_color}
            tooltip={w.tips.textColorTooltip}
          />
          <ColorInput
            label={$t('Name Text Color')}
            {...w.bind.font_color2}
            tooltip={w.tips.nameColorTooltip}
          />
          <ColorInput
            label={$t('Amount Text Color')}
            {...w.bind.font_color3}
            tooltip={w.tips.amountColorTooltip}
          />
        </>
      )}
    </WidgetLayout>
  );
}

export class DonationTickerModule extends WidgetModule<IDonationTickerState> {
  patchAfterFetch(data: any): IDonationTickerState {
    // backend accepts and returns some numerical values as strings
    data.settings.font_size = parseInt(data.settings.font_size, 10);
    data.settings.font_weight = parseInt(data.settings.font_weight, 10);
    return data;
  }

  tips = {
    messageFormatTooltip:
      // tslint:disable-next-line:prefer-template
      $t(
        'Each donation that shows in the donation ticker will be in this format. Available tokens:',
      ) +
      ' {name} ' +
      $t('The name of the donator,') +
      ' {amount} ' +
      $t('The amount that was donated'),

    maxDonationsTooltip: $t(
      'The maximum amount of donations to show in the ticker. Must be a number greater than 0.',
    ),

    scrollSpeedTooltip: $t(
      'How fast the ticker should scroll between 1 (fastest) and 10 (slowest). Set to 0 for no scrolling.',
    ),

    backgroundColorTooltip: $t(
      'A hex code for the widget background. This is for preview purposes only. It will not be shown in your stream.',
    ),

    fontSizeTooltip: $t(
      'The font size in pixels. Reasonable size typically ranges between 24px and 48px.',
    ),

    fontWeightTooltip: $t(
      'How thick to make the font. The value should range between 300 (thinnest) and 900 (thickest)',
    ),

    textColorTooltip: $t('A hex code for the base text color.'),

    // tslint:disable-next-line:prefer-template
    nameColorTooltip: $t('A hex color for the text of the') + ' {name} ' + $t('token'),

    // tslint:disable-next-line:prefer-template
    amountColorTooltip: $t('A hex color for the text of the') + ' {amount} ' + $t('token'),
  };
}

function useDonationTicker() {
  return useWidget<DonationTickerModule>();
}
