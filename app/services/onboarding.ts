import { Subject } from 'rxjs';
import { Inject } from './core/injector';
import { StatefulService, mutation } from './core/stateful-service';
import { NavigationService } from './navigation';
import { UserService } from './user';

type TOnboardingStep = 'Connect' | 'ObsImport';

interface IOnboardingOptions {
  skipImport: boolean; // When logging into a new account after onboarding
  isSecurityUpgrade: boolean; // When logging in, display a special message
  skipLogin: boolean; // When logging in, skip the onboarding process
  // about our security upgrade.
}

interface IOnboardingServiceState {
  options: IOnboardingOptions;
  currentStep: TOnboardingStep;
  completedSteps: TOnboardingStep[];
}

// Represents a single step in the onboarding flow.
// Implemented as a linked list.
interface IOnboardingStep {
  // Whether this step should run.  The service is
  // passed in as an argument.
  isEligible: (service: OnboardingService) => boolean;

  // The next step in the flow
  next?: TOnboardingStep;
}

const ONBOARDING_STEPS: Dictionary<IOnboardingStep> = {
  Connect: {
    isEligible: () => true,
    next: 'ObsImport',
  },

  ObsImport: {
    isEligible: service => {
      if (service.options.skipImport) return false;
      return true;
    },
  },
};

export class OnboardingService extends StatefulService<IOnboardingServiceState> {
  static initialState: IOnboardingServiceState = {
    options: {
      skipImport: false,
      isSecurityUpgrade: false,
      skipLogin: false,
    },
    currentStep: null,
    completedSteps: [],
  };

  localStorageKey = 'UserHasBeenOnboarded';

  completed = new Subject<void>();

  @Inject() navigationService: NavigationService;
  @Inject() userService: UserService;

  @mutation()
  SET_CURRENT_STEP(step: TOnboardingStep) {
    this.state.currentStep = step;
  }

  @mutation()
  RESET_COMPLETED_STEPS() {
    this.state.completedSteps = [];
  }

  @mutation()
  SET_OPTIONS(options: Partial<IOnboardingOptions>) {
    Object.assign(this.state.options, options);
  }

  @mutation()
  COMPLETE_STEP(step: TOnboardingStep) {
    this.state.completedSteps.push(step);
  }

  get currentStep() {
    return this.state.currentStep;
  }

  get options() {
    return this.state.options;
  }

  get completedSteps() {
    return this.state.completedSteps;
  }

  // Completes the current step and moves on to the
  // next eligible step.
  next() {
    this.COMPLETE_STEP(this.state.currentStep);
    this.goToNextStep(ONBOARDING_STEPS[this.state.currentStep].next);
  }

  // Skip the current step and move on to the next
  // eligible step.
  skip() {
    this.goToNextStep(ONBOARDING_STEPS[this.state.currentStep].next);
  }

  // A login attempt is an abbreviated version of the onboarding process,
  // and some steps should be skipped.
  start(options: Partial<IOnboardingOptions> = {}) {
    const actualOptions: IOnboardingOptions = {
      skipImport: false,
      isSecurityUpgrade: false,
      skipLogin: false,
      ...options,
    };

    this.RESET_COMPLETED_STEPS();
    this.SET_OPTIONS(actualOptions);
    this.SET_CURRENT_STEP(actualOptions.skipLogin ? 'ObsImport' : 'Connect');
    // Studioの初期化が終わってから遷移する
    setTimeout(() => {
      this.navigationService.navigate('Onboarding');
    }, 0);
  }

  // Ends the onboarding process
  finish() {
    localStorage.setItem(this.localStorageKey, 'true');
    this.navigationService.navigate('Studio');
    this.completed.next();
  }

  private goToNextStep(step: TOnboardingStep) {
    if (!step) {
      this.finish();
      return;
    }

    const stepObj = ONBOARDING_STEPS[step];

    if (stepObj.isEligible(this)) {
      this.SET_CURRENT_STEP(step);
    } else {
      this.goToNextStep(stepObj.next);
    }
  }

  startOnboardingIfRequired(): boolean {
    if (localStorage.getItem(this.localStorageKey)) {
      const started = this.forceLoginForSecurityUpgradeIfRequired();
      if (!started) {
        this.completed.next();
      }

      return started;
    }

    this.start();
    return true;
  }

  forceLoginForSecurityUpgradeIfRequired(): boolean {
    if (!this.userService.isLoggedIn()) return false;

    if (!this.userService.apiToken) {
      this.start({ skipImport: true, isSecurityUpgrade: true });
      return true;
    }
    return false;
  }
}
