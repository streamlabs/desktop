import React from 'react';
import * as steps from './steps';
import { EOnboardingSteps } from 'services/onboarding/onboarding-v2';
import { Services } from 'components-react/service-provider';
import { useRealmObject } from 'components-react/hooks/realm';
import KevinSvg from 'components-react/shared/KevinSvg';
import { Button } from 'antd';
import { $t } from 'services/i18n';

const STEPS_MAP = {
  [EOnboardingSteps.Splash]: steps.Splash,
  [EOnboardingSteps.Login]: () => <></>,
  [EOnboardingSteps.RecordingLogin]: () => <></>,
  [EOnboardingSteps.ConnectMore]: () => <></>,
  [EOnboardingSteps.Devices]: () => <></>,
  [EOnboardingSteps.OBSImport]: () => <></>,
  [EOnboardingSteps.Ultra]: () => <></>,
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
      <KevinSvg />
      <Component />
      <div>
        <Button onClick={stepBack}>{$t('Back')}</Button>
        {currentStep.isSkippable && <Button onClick={takeStep}>{$t('Skip')}</Button>}
        <Button onClick={takeStep}>{$t('Continue')}</Button>
      </div>
    </div>
  );
}
