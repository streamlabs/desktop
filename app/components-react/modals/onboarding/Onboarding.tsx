import React, { useCallback } from 'react';
import * as remote from '@electron/remote';
import * as steps from './steps';
import { EOnboardingSteps } from 'services/onboarding/onboarding-v2';
import { Services } from 'components-react/service-provider';
import { useRealmObject } from 'components-react/hooks/realm';
import { Button } from 'antd';
import { $t } from 'services/i18n';
import { EPlatformCallResult, externalAuthPlatforms, TPlatform } from 'services/platforms';
import UltraIcon from 'components-react/shared/UltraIcon';
import KevinSvg from 'components-react/shared/KevinSvg';

const STEPS_MAP = {
  [EOnboardingSteps.Splash]: steps.Splash,
  [EOnboardingSteps.Login]: steps.Login,
  [EOnboardingSteps.RecordingLogin]: () => <></>,
  [EOnboardingSteps.ConnectMore]: steps.ConnectMore,
  [EOnboardingSteps.Devices]: () => <></>,
  [EOnboardingSteps.OBSImport]: () => <></>,
  [EOnboardingSteps.Ultra]: steps.Ultra,
  [EOnboardingSteps.Themes]: () => <></>,
};

export default function Onboarding() {
  const { OnboardingV2Service } = Services;

  const currentStep = useRealmObject(OnboardingV2Service.state.currentStep);

  function closeModal() {}

  function takeStep() {
    OnboardingV2Service.actions.takeStep();
  }

  function stepBack() {
    OnboardingV2Service.actions.stepBack();
  }

  const Component = STEPS_MAP[currentStep.name];

  return (
    <div>
      {currentStep.isClosable && <i className="icon-close" onClick={closeModal} />}
      <Component />
      <div>
        <Button onClick={stepBack}>{$t('Back')}</Button>
        {currentStep.isSkippable && <Button onClick={takeStep}>{$t('Skip')}</Button>}
        <Button onClick={takeStep}>{$t('Continue')}</Button>
      </div>
    </div>
  );
}

export function Header(p: { title: string; description?: string }) {
  return (
    <>
      <KevinSvg />
      <h2>{p.title}</h2>
      {p.description && <span>{p.description}</span>}
    </>
  );
}

export function ImageCard(p: {
  metadata: { img: string; title: string; description: string; isUltra?: boolean };
}) {
  return (
    <div>
      <img src={p.metadata.img} />
      <h4>
        {p.metadata.isUltra && <UltraIcon />}
        {p.metadata.title}
      </h4>
      <span>{p.metadata.description}</span>
    </div>
  );
}

export function useAuth() {
  const { UsageStatisticsService, OnboardingV2Service, UserService } = Services;

  const SLIDLogin = useCallback(() => {
    UsageStatisticsService.actions.recordAnalyticsEvent('PlatformLogin', 'streamlabs');
    UserService.startSLAuth().then((status: EPlatformCallResult) => {
      if (status !== EPlatformCallResult.Success) return;
      OnboardingV2Service.actions.takeStep();
    });
  }, []);

  const platformLogin = useCallback(async (platform: TPlatform, merge = false) => {
    UsageStatisticsService.actions.recordAnalyticsEvent('PlatformLogin', platform);
    const result = await UserService.startAuth(
      platform,
      externalAuthPlatforms.includes(platform) ? 'external' : 'internal',
      merge,
    );

    if (result === EPlatformCallResult.TwitchTwoFactor) {
      remote.dialog
        .showMessageBox({
          type: 'error',
          message: $t(
            'Twitch requires two factor authentication to be enabled on your account in order to stream to Twitch. ' +
              'Please enable two factor authentication and try again.',
          ),
          title: $t('Twitch Authentication Error'),
          buttons: [$t('Enable Two Factor Authentication'), $t('Dismiss')],
        })
        .then(({ response }) => {
          if (response === 0) {
            remote.shell.openExternal('https://twitch.tv/settings/security');
          }
          return;
        });
    }
    OnboardingV2Service.actions.takeStep();
  }, []);

  const mergePlatform = useCallback((platform: TPlatform) => {
    platformLogin(platform, true);
  }, []);

  return { SLIDLogin, platformLogin, mergePlatform };
}
