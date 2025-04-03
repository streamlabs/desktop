import React, { useEffect, useMemo, useContext, createContext } from 'react';
import { Button, Progress } from 'antd';
import styles from './Onboarding.m.less';
import commonStyles from './Common.m.less';
import { Services } from 'components-react/service-provider';
import { injectState, useModule, mutation } from 'slap';
import cx from 'classnames';
import { $t } from 'services/i18n';
import * as stepComponents from './steps';
import Utils from 'services/utils';
import { IOnboardingStep, ONBOARDING_STEPS } from 'services/onboarding';
import Scrollable from 'components-react/shared/Scrollable';
import StreamlabsDesktopIcon from 'components-react/shared/StreamlabsDesktopIcon';
import { SkipContext } from './OnboardingContext';

export default function Onboarding() {
  const {
    currentStep,
    steps,
    totalSteps,
    next,
    processing,
    finish,
    UsageStatisticsService,
    singletonStep,
  } = useModule(OnboardingModule);

  // This would probably be easier with Vuex or RxJS but not sure how easy is to rely on return values
  const ctx = useContext(SkipContext);

  const skip = () => {
    // Return false from skip function to avoid running the default skip logic
    const result = ctx.onSkip();

    // We do not want to reset onSkip if the skip function returns undefined
    if (result === undefined) return;

    // Reset onSkip to default, after a component's custom skip function has run
    ctx.onSkip = () => true;

    // Skip default behavior if the skip function returns false
    if (result === false) return;

    next(true);
  };

  useEffect(() => {
    if (!singletonStep) {
      UsageStatisticsService.actions.recordShown('Onboarding', currentStep.component);
    }
  }, [currentStep.component]);

  const currentStepIndex = useMemo(() => {
    if (!currentStep) {
      return 0;
    }

    return steps.findIndex(step => step.component === currentStep.component);
  }, [steps]);

  // TODO: Onboarding service needs a refactor away from step index-based.
  // In the meantime, if we run a render cycle and step index is greater
  // than the total number of steps, we just need to end the onboarding
  // immediately. Render side effects are bad btw.
  // TODO: we might not need this anymore, can't find instance where currentStep === null
  if (currentStep == null) {
    finish();
    return <></>;
  }

  const Component = stepComponents[currentStep.component];

  // Hide footer on singleton steps
  const shouldShowFooter = !singletonStep;

  return (
    <div className={cx(styles.onboardingContainer)}>
      <TopBar />

      <div className={styles.onboardingContent}>
        <Scrollable style={{ height: '100%' }}>
          <Component />
          {!currentStep.hideButton && <ActionButton />}
        </Scrollable>
      </div>

      {shouldShowFooter && (
        <Footer
          onSkip={skip}
          currentStep={currentStep}
          currentStepIndex={currentStepIndex}
          isProcessing={processing}
          totalSteps={totalSteps}
        />
      )}
    </div>
  );
}

interface FooterProps {
  currentStep: IOnboardingStep;
  currentStepIndex: number;
  totalSteps: number;
  onSkip: () => void;
  isProcessing: boolean;
}

function Footer({ currentStep, totalSteps, onSkip, isProcessing, currentStepIndex }: FooterProps) {
  const percent = ((currentStepIndex + 1) / totalSteps) * 100;

  /* Skip pagination on Ultra step since it overlaps */
  const isPrimeStep = currentStep.component === 'Prime';

  return (
    <div className={cx(styles.footer, { [styles.footerPrime]: isPrimeStep })}>
      <div className={cx(styles.progress, { [styles.progressWithSkip]: currentStep.isSkippable })}>
        <Progress showInfo={false} steps={totalSteps} percent={percent} />
      </div>

      {currentStep.isSkippable && (
        <div className={styles.skip}>
          <button
            className={cx('button button--trans', styles.linkButton, commonStyles.onboardingButton)}
            onClick={onSkip}
            disabled={isProcessing}
          >
            {$t('Skip')}
          </button>
        </div>
      )}
    </div>
  );
}

function TopBarLogo({ component }: { component: string }) {
  return <StreamlabsDesktopIcon />;
}

function TopBar() {
  const component = useModule(OnboardingModule).currentStep.component;
  return (
    <div
      className={cx(styles.topBarContainer, {
        [styles.topBarContainerPrime]: component === 'Prime',
      })}
    >
      <TopBarLogo component={component} />
    </div>
  );
}

function ActionButton() {
  const { currentStep, next, processing } = useModule(OnboardingModule);

  if (currentStep.hideButton) return null;

  const isPrimeStep = currentStep.component === 'Prime';

  return (
    <div style={{ flex: 1, justifyContent: 'center', display: 'flex', alignItems: 'center' }}>
      <Button
        className={cx(styles.actionButton, { 'button--prime': isPrimeStep })}
        type="primary"
        shape="round"
        size="large"
        onClick={() => next()}
        disabled={processing}
      >
        {isPrimeStep ? $t('Go Ultra') : $t('Continue')}
      </Button>
    </div>
  );
}

export class OnboardingModule {
  state = injectState({
    stepIndex: 0,
    processing: false,
  });

  get OnboardingService() {
    return Services.OnboardingService;
  }

  get RecordingModeService() {
    return Services.RecordingModeService;
  }

  get UsageStatisticsService() {
    return Services.UsageStatisticsService;
  }

  get UserService() {
    return Services.UserService;
  }

  get steps() {
    return this.OnboardingService.views.steps;
  }

  get totalSteps() {
    return this.OnboardingService.views.totalSteps;
  }

  get singletonStep() {
    return this.OnboardingService.views.singletonStep;
  }

  get currentStep(): IOnboardingStep {
    // Useful for testing in development
    if (Utils.env.SLD_FORCE_ONBOARDING_STEP) {
      return ONBOARDING_STEPS()[Utils.env.SLD_FORCE_ONBOARDING_STEP];
    }

    return this.singletonStep ?? this.steps[this.state.stepIndex];
  }

  get preboardingOffset() {
    return this.steps.filter(step => step.isPreboarding).length;
  }

  get isLogin() {
    return this.OnboardingService.state.options.isLogin;
  }

  setRecordingMode(val: boolean) {
    this.RecordingModeService.setRecordingMode(val);
    if (val) {
      this.RecordingModeService.setUpRecordingFirstTimeSetup();
    }
  }

  get isRecordingModeEnabled() {
    return this.RecordingModeService.views.isRecordingModeEnabled;
  }

  setImportFromObs() {
    this.OnboardingService.setImport('obs');
  }

  setImportFromTwitch() {
    this.OnboardingService.setImport('twitch');
  }

  finish() {
    if (!this.singletonStep) {
      this.UsageStatisticsService.actions.recordShown('Onboarding', 'completed');
    }
    this.OnboardingService.actions.finish();
  }

  @mutation()
  next(isSkip = false) {
    if (this.state.processing) return;

    if (this.OnboardingService.state.options.isLogin && this.UserService.views.isPartialSLAuth) {
      return;
    }

    if (
      this.RecordingModeService.views.isRecordingModeEnabled &&
      this.currentStep.component === 'HardwareSetup' &&
      !this.OnboardingService.state.options.isHardware &&
      !isSkip
    ) {
      this.RecordingModeService.actions.addRecordingWebcam();
    }

    if (this.state.stepIndex >= this.steps.length - 1 || this.singletonStep) {
      return this.finish();
    }

    this.state.stepIndex += 1;
  }

  @mutation()
  setProcessing(val: boolean) {
    this.state.processing = val;
  }
}
