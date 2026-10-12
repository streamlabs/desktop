import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { Button, Modal } from 'antd';
import * as remote from '@electron/remote';
import * as steps from './steps';
import { EOnboardingSteps } from 'services/onboarding/onboarding-v2';
import { Services } from 'components-react/service-provider';
import { useRealmObject, useRealmObjectProperty } from 'components-react/hooks/realm';
import { useVuex } from 'components-react/hooks';
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
  const { OnboardingV2Service, RecordingModeService, UserService } = Services;

  const [processing, setProcessing] = useState(false);

  // Avoid re-rendering the entire onboarding modal when `showOnboarding` changes
  // by getting the `currentStep` separately
  const currentStep = useRealmObjectProperty(OnboardingV2Service.state.currentStep);
  const { currentIndex, showOnboarding } = useRealmObject(OnboardingV2Service.state);
  const { isPartialSLAuth } = useVuex(() => ({
    isPartialSLAuth: !!UserService.views.isPartialSLAuth,
  }));

  const continueFuncs: PartialRec<EOnboardingSteps, () => void | false> = useMemo(
    () => ({
      [EOnboardingSteps.ConnectMore]: () => {
        // With only a partial SLID auth the user has no platform to continue with, so
        // "continue" discards that auth and returns to the Login step to switch accounts
        if (!UserService.views.isPartialSLAuth) return;
        UserService.actions.finishSLAuth();
        OnboardingV2Service.actions.stepBack();
        return false;
      },
      [EOnboardingSteps.Devices]: () => {
        RecordingModeService.actions.addRecordingWebcam();
      },
    }),
    [],
  );

  useEffect(() => {
    OnboardingV2Service.actions.showOnboardingIfNecessary();
  }, []);

  function closeModal() {
    if (processing) return;
    OnboardingV2Service.actions.closeOnboarding();
  }

  function cont() {
    // A continue func can return `false` to replace the default advance to the next step
    if (continueFuncs[currentStep.name]?.() === false) return;
    takeStep();
  }

  function takeStep(skipped?: boolean) {
    if (processing) return;
    OnboardingV2Service.actions.takeStep(skipped);
  }

  function stepBack() {
    if (processing) return;
    OnboardingV2Service.actions.stepBack();
  }

  if (!currentStep || !showOnboarding) return <></>;

  const Component = STEPS_MAP[currentStep.name];
  const continueTexts: PartialRec<EOnboardingSteps, string> = {
    [EOnboardingSteps.ConnectMore]: isPartialSLAuth ? $t('Switch Account') : $t('Continue'),
    [EOnboardingSteps.Ultra]: $t('Continue with Free'),
    [EOnboardingSteps.Themes]: $t('Finish'),
  };
  const continueText = continueTexts[currentStep.name] || $t('Continue');

  return (
    <Modal
      closable={false}
      keyboard={false}
      maskClosable={false}
      onCancel={closeModal}
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
            <Button type="primary" onClick={cont}>
              {continueText}
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
    <div className={styles.header}>
      <div className={styles.kevinBox}>
        <KevinSvg style={{ height: 32, width: 36, fill: 'var(--background)' }} />
      </div>
      <h1 style={{ marginBottom: !p.description ? 16 : undefined }}>{p.title}</h1>
      {p.description && <span>{p.description}</span>}
    </div>
  );
}

export function ImageCard(p: {
  metadata: { img: string; title: string; description: string; isUltra?: boolean; count?: number };
}) {
  return (
    <div
      style={{
        textAlign: 'left',
        padding: 16,
        maxWidth: `${Math.floor(900 / (p.metadata.count || 3))}px`,
      }}
    >
      <img style={{ width: '100%', height: 'auto', marginBottom: 16 }} src={p.metadata.img} />
      <h4>
        {p.metadata.isUltra && <UltraIcon style={{ marginRight: 4 }} />}
        {p.metadata.title}
      </h4>
      <span style={{ width: '100%' }}>{p.metadata.description}</span>
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

  /**
   * An SLID auth is only partial (no primary platform, not validated) until
   * `finishSLAuth` runs. That is what runs the full login and emits
   * `userLoginFinished`, so it must happen before the flow continues.
   */
  const finishSLID = useCallback(async (primaryPlatform: TPlatform) => {
    const result = await UserService.actions.return.finishSLAuth(primaryPlatform);

    if (result === EPlatformCallResult.TwitchScopeMissing) {
      await remote.dialog.showMessageBox(remote.getCurrentWindow(), {
        type: 'warning',
        message: $t(
          'Streamlabs requires additional permissions from your Twitch account. Please log in with Twitch to continue.',
        ),
        title: $t('Twitch Authentication Error'),
        buttons: [$t('Refresh Login')],
      });

      // Initiate a Twitch merge to get permissions
      return UserService.actions.startAuth('twitch', 'external', true);
    }
  }, []);

  const SLIDLogin = useCallback(async () => {
    UsageStatisticsService.actions.recordAnalyticsEvent('PlatformLogin', 'streamlabs');
    const status: EPlatformCallResult = await UserService.actions.return.startSLAuth();
    if (status !== EPlatformCallResult.Success) return;

    // With at least one linked platform we can complete the login right away.
    // Otherwise the ConnectMore step prompts for a platform and completes it.
    const [primaryPlatform] = UserService.views.linkedPlatforms;
    if (primaryPlatform) {
      await finishSLID(primaryPlatform);
      if (!UserService.views.isLoggedIn) return;
    }

    OnboardingV2Service.actions.takeStep();
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
            'Twitch requires two factor authentication to be enabled on your account in order to stream to Twitch. Please enable two factor authentication and try again.',
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

    // Merging a platform into a partial SLID auth gives it its first platform,
    // which lets us complete the login.
    if (merge && result === EPlatformCallResult.Success && UserService.views.isPartialSLAuth) {
      await finishSLID(platform);
    }

    OnboardingV2Service.actions.takeStep();
  }, []);

  const mergePlatform = useCallback((platform: TPlatform) => {
    platformLogin(platform, true);
  }, []);

  return { SLIDLogin, platformLogin, mergePlatform };
}
