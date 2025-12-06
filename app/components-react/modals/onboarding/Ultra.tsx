import React, { useEffect } from 'react';
import * as remote from '@electron/remote';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import UltraBox from 'components-react/shared/UltraBox';
import UltraIcon from 'components-react/shared/UltraIcon';
import ButtonHighlighted from 'components-react/shared/ButtonHighlighted';
import { Header, ImageCard, IOnboardingStepProps } from './Onboarding';

export function Ultra(p: IOnboardingStepProps) {
  const { MagicLinkService, UserService, OnboardingV2Service } = Services;

  useEffect(() => {
    const sub = UserService.subscribedToPrime.subscribe(() => {
      OnboardingV2Service.actions.takeStep();
    });
    return sub.unsubscribe;
  }, []);

  function clickUltraLink() {
    MagicLinkService.actions.linkToPrime('slobs-onboarding');
  }

  function clickFree() {
    OnboardingV2Service.actions.takeStep();
  }

  function clickInfo() {
    remote.shell.openExternal('https://www.streamlabs.com/ultra?refl=slobs-onboarding');
  }

  const promoMetadata = [
    {
      title: $t('Premium Stream Overlays'),
      description: $t(
        'Create a stream that feels uniquely yours with thousands of premium and AI powered reactive overlays.',
      ),
      img: '',
    },
    {
      title: $t('Multistream Everywhere'),
      description: $t(
        'Go live on Twitch, YouTube, Kick, and more at the same time to reach a wider audience. Our servers do the work so your PC can stream.',
      ),
      img: '',
    },
    {
      title: $t('Unlimited App Access'),
      description: $t(
        'Unlock powerful apps to customize and grow your stream, including AI powered streaming features.',
      ),
      img: '',
    },
  ];

  return (
    <div>
      <Header title={$t('Choose Your Plan')} />
      <UltraBox>
        <h3>
          <UltraIcon />
          {$t('Streamlabs Ultra')}
        </h3>
        <span>
          {$t('Unlock powerful tools to help you grow faster and stand out from the crowd.')}
        </span>
        <div style={{ display: 'flex' }}>
          {promoMetadata.map(data => (
            <ImageCard metadata={data} key={data.title} />
          ))}
        </div>
        <ButtonHighlighted onClick={clickUltraLink}>
          {$t('Join Ultra for $27/mo or $189/yr')}
        </ButtonHighlighted>
        <a onClick={clickInfo}>{$t('Or explore dozens more Ultra benefits')}</a>
      </UltraBox>
      <div style={{ display: 'flex' }} onClick={clickFree}>
        <div>
          <h3>
            <i className="icon-kevin" />
            {$t('Free')}
          </h3>
          <span>
            {$t('Everything you need to stream for free. You can upgrade to Ultra at any time.')}
          </span>
        </div>
        <h4>{$t('Free, forever.')}</h4>
      </div>
    </div>
  );
}
