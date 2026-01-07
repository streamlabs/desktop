import React, { useCallback, useState, useEffect } from 'react';
import { Button, Modal } from 'antd';
import * as remote from '@electron/remote';
import * as steps from './steps';
import { EOnboardingSteps } from 'services/onboarding/onboarding-v2';
import { Services } from 'components-react/service-provider';
import { useRealmObject } from 'components-react/hooks/realm';
import { $t } from 'services/i18n';
import { EPlatformCallResult, externalAuthPlatforms, TPlatform } from 'services/platforms';
import UltraIcon from 'components-react/shared/UltraIcon';
import KevinSvg from 'components-react/shared/KevinSvg';
import styles from './Common.m.less';
import { $i } from 'services/utils';

const NO_BUTTON_STEPS = new Set([EOnboardingSteps.Splash, EOnboardingSteps.Login]);

export interface IOnboardingStepProps {
  processing: boolean;
  setProcessing: (val: boolean) => void;
}

const STEPS_MAP = {
  [EOnboardingSteps.Splash]: steps.Splash,
  [EOnboardingSteps.Login]: steps.Login,
  [EOnboardingSteps.RecordingLogin]: steps.RecordingLogin,
  [EOnboardingSteps.ConnectMore]: steps.ConnectMore,
  [EOnboardingSteps.Devices]: steps.Devices,
  [EOnboardingSteps.OBSImport]: steps.OBSImport,
  [EOnboardingSteps.Ultra]: steps.Ultra,
  [EOnboardingSteps.Themes]: steps.Themes,
};

export default function Onboarding() {
  const { OnboardingV2Service } = Services;

  const [processing, setProcessing] = useState(false);

  const currentStep = useRealmObject(OnboardingV2Service.state).currentStep;
  const currentIndex = useRealmObject(OnboardingV2Service.state).currentIndex;
  const showOnboarding = useRealmObject(OnboardingV2Service.state).showOnboarding;

  useEffect(() => {
    OnboardingV2Service.actions.showOnboardingIfNecessary();
  }, []);

  function closeModal() {
    if (processing) return;
    OnboardingV2Service.actions.closeOnboarding();
  }

  function takeStep(skipped?: boolean) {
    if (processing) return;
    OnboardingV2Service.actions.takeStep(skipped);
  }

  function stepBack() {
    if (processing) return;
    OnboardingV2Service.actions.stepBack();
  }

  if (!currentStep) return <></>;

  const Component = STEPS_MAP[currentStep.name];

  return (
    <Modal
      closable={currentStep.isClosable}
      onCancel={closeModal}
      maskClosable={false}
      destroyOnClose
      centered
      bodyStyle={{ padding: 32, height: '100%' }}
      className={styles.modalWrapper}
      visible={showOnboarding}
      getContainer={false}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          {currentIndex !== 0 && (
            <Button onClick={stepBack} type="link">
              {$t('Back')}
            </Button>
          )}
          {currentStep.isSkippable && (
            <Button type="link" style={{ marginLeft: 'auto' }} onClick={() => takeStep(true)}>
              {$t('Skip')}
            </Button>
          )}
          {!NO_BUTTON_STEPS.has(currentStep.name) && (
            <Button type="primary" onClick={() => takeStep()}>
              {$t('Continue')}
            </Button>
          )}
        </div>
      }
    >
      <Component processing={processing} setProcessing={setProcessing} />
    </Modal>
  );
}

export function Header(p: { title: string; description?: string }) {
  return (
    <>
      <div className={styles.kevinBox}>
        <KevinSvg style={{ height: 32, width: 36, fill: 'var(--background)' }} />
      </div>
      <h1>{p.title}</h1>
      {p.description && <span style={{ marginBottom: 16 }}>{p.description}</span>}
    </>
  );
}

export function ImageCard(p: {
  metadata: { img: string; title: string; description: string; isUltra?: boolean };
}) {
  return (
    <div style={{ textAlign: 'left', padding: 16 }}>
      <img style={{ height: 160, width: 'auto', marginBottom: 16 }} src={p.metadata.img} />
      <h4>
        {p.metadata.isUltra && <UltraIcon style={{ marginRight: 4 }} />}
        {p.metadata.title}
      </h4>
      <span>{p.metadata.description}</span>
    </div>
  );
}

export function DancingKevins() {
  const url = $i('webm/kevin_jump.webm');

  return (
    <div style={{ display: 'flex', height: 160 }}>
      <video src={url} controls={false} autoPlay loop style={{ margin: '0 -150px' }} />
      <video src={`${url}#t=1`} controls={false} autoPlay loop style={{ margin: '0 -150px' }} />
      <video src={`${url}#t=2`} controls={false} autoPlay loop style={{ margin: '0 -150px' }} />
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
