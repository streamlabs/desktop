import ButtonHighlighted from 'components-react/shared/ButtonHighlighted';
import UltraBox from 'components-react/shared/UltraBox';
import UltraIcon from 'components-react/shared/UltraIcon';
import React from 'react';
import { $t } from 'services/i18n';

export default function BackgroundRemovalFree() {
  return (
    <div>
      <h2>
        <UltraIcon /> {$t('Background Removal')}
      </h2>
      <span>
        {$t('Automatically remove the background on your video without the use of a green screen.')}
      </span>

      <UltraBox>
        <UltraIcon />
        <p>
          {$t(
            'Enjoy all the benefits of Streamlab’s Background Removal filter plus multistreaming, cloud shift, overlays and more by going Ultra.',
          )}
          <span>{$t('Learn More')}</span>
        </p>
        <ButtonHighlighted>{$t('Get Ultra')}</ButtonHighlighted>
      </UltraBox>
    </div>
  );
}
