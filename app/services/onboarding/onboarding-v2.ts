import { RealmObject } from 'services/realm';
import { ObjectSchema } from 'realm';
import * as remote from '@electron/remote';
import { Inject, Service } from 'services/core';
import {
  AppService,
  ObsImporterService,
  RecordingModeService,
  SceneCollectionsService,
  UsageStatisticsService,
  UserService,
  WindowsService,
} from 'app-services';
import Utils from '../utils';

export enum EOnboardingSteps {
  Splash = 'Splash',
  Login = 'Login',
  RecordingLogin = 'RecordingLogin',
  ConnectMore = 'ConnectMore',
  OBSImport = 'OBSImport',
  Ultra = 'Ultra',
  Devices = 'Devices',
  Themes = 'Themes',
}

interface IOnboardingStep {
  name: EOnboardingSteps;
  isSkippable?: boolean;
  isClosable?: boolean;
}

interface IOnboardingInitialization {
  startingStep: IOnboardingStep;
  isSingleton?: boolean;
}

type TOnboardingNavigationEvent = 'skip' | 'continue' | 'backtrack' | 'completed' | 'closed';
type TOnboardingInteractionEvent = 'connectPlatform' | 'installTheme' | 'browseThemes';

class OnboardingStep {
  config: IOnboardingStep;
  next: OnboardingStep | null = null;
  prev: OnboardingStep | null = null;

  constructor(config: IOnboardingStep) {
    this.config = config;
  }
}

class OnboardingPath {
  private head: OnboardingStep | null = null;
  private current: OnboardingStep | null = null;
  private size = 0;
  private currentIndex = 0;

  // Extracted to getters to prevent external mutation
  get length() {
    return this.size;
  }

  get index() {
    return this.currentIndex;
  }

  get prevStepName() {
    return this.current.prev?.config.name;
  }

  get nextStepName() {
    return this.current.next?.config.name;
  }

  // Adds a node to the end of the list
  append(config: IOnboardingStep) {
    const step = new OnboardingStep(config);
    if (!this.head) {
      this.head = step;
      this.current = step;
    } else {
      const lastStep = this.getFinalNode(this.head);
      lastStep.next = step;
      step.prev = lastStep;
    }
    this.size += 1;
  }

  // Returns false if at end of list, marking the end of the flow and no more steps
  takeNextStep() {
    if (!this.current.next) return false;
    this.current = this.current.next;
    this.currentIndex += 1;
    return this.current.config;
  }

  // Returns false if at beginning of list and cannot go back further
  takePrevStep() {
    if (!this.current.prev) return false;
    this.current = this.current.prev;
    this.currentIndex -= 1;
    return this.current.config;
  }

  find(searchCb: (config: IOnboardingStep) => boolean) {
    function checkStep(step: OnboardingStep): OnboardingStep | null {
      if (searchCb(step.config)) return step;
      return step.next ? checkStep(step.next) : null;
    }

    return this.head ? checkStep(this.head) : null;
  }

  private getFinalNode(startingNode: OnboardingStep): OnboardingStep {
    return startingNode.next ? this.getFinalNode(startingNode.next) : startingNode;
  }
}

class OnboardingStepState extends RealmObject implements IOnboardingStep {
  name: EOnboardingSteps;
  isSkippable: boolean;
  isClosable: boolean;

  static schema: ObjectSchema = {
    name: 'OnboardingStepState',
    properties: {
      name: 'string',
      isSkippable: { type: 'bool', default: false },
      isClosable: { type: 'bool', default: false },
    },
  };
}

OnboardingStepState.register();

class OnboardingServiceState extends RealmObject {
  currentStep: IOnboardingStep;
  showOnboarding: boolean;
  currentIndex: number;
  pathLength: number;

  static schema: ObjectSchema = {
    name: 'OnboardingServiceState',
    properties: {
      currentStep: 'OnboardingStepState',
      showOnboarding: { type: 'bool', default: false },
      currentIndex: { type: 'int', default: 0 },
      pathLength: { type: 'int', default: 0 },
    },
  };
}

OnboardingServiceState.register();

export class OnboardingV2Service extends Service {
  @Inject() private recordingModeService: RecordingModeService;
  @Inject() private userService: UserService;
  @Inject() private obsImporterService: ObsImporterService;
  @Inject() private sceneCollectionsService: SceneCollectionsService;
  @Inject() private usageStatisticsService: UsageStatisticsService;
  @Inject() private appService: AppService;
  @Inject() private windowsService: WindowsService;

  state = OnboardingServiceState.inject();
  /**
   * flows
   *
   * Free User
   * Login Splash -> Login Select -> Connect More Platforms (if <2 platforms) -> OBS Import (if obs installed) -> Ultra Upsell -> Setup Devices -> Themes
   *
   * Ultra User
   * Login Splash -> Login Select -> Connect More Platforms (if <2 platforms) -> OBS Import (if obs installed) -> Setup Devices -> Themes
   *
   * Recording Mode
   * Login Splash -> Recording Mode Login -> OBS Import (if obs installed)
   */

  path: OnboardingPath = null;
  singletonPath = false;
  localStorageKey = 'UserHasBeenOnboarded';

  get currentStepName() {
    return this.state.currentStep.name;
  }

  showOnboardingIfNecessary() {
    if (Utils.env.SLD_FORCE_ONBOARDING_STEP) this.showOnboarding();
    if (
      this.appService.state.onboarded ||
      this.userService.isAlphaGroup ||
      localStorage.getItem(this.localStorageKey)
    ) {
      return;
    }
    this.showOnboarding();
  }

  showOnboarding() {
    this.initalizeView({ startingStep: { name: EOnboardingSteps.Splash }, isSingleton: false });
  }

  showLogin() {
    this.initalizeView({
      startingStep: { name: EOnboardingSteps.Login, isClosable: true },
      isSingleton: true,
    });
  }

  showObsImport() {
    this.initalizeView({
      startingStep: { name: EOnboardingSteps.OBSImport, isClosable: true },
      isSingleton: true,
    });
  }

  takeStep(skipped?: boolean) {
    this.recordOnboardingNavEvent(skipped ? 'skip' : 'continue');
    let nextStep = this.path.takeNextStep();
    // the nextStep will already exist if the user has backtracked
    if (!nextStep) {
      // if there is no next step we determine if the path has additional steps
      this.determineSteps();
      nextStep = this.path.takeNextStep();
      if (!nextStep) {
        // if there are no additional steps we've reached the end of the path
        this.completeOnboarding();
      }
    }
    this.setCurrentStep(nextStep);
    this.setIndex(this.path.index);
  }

  stepBack() {
    this.recordOnboardingNavEvent('backtrack');
    const prevStep = this.path.takePrevStep();
    if (!prevStep) return;
    this.setCurrentStep(prevStep);
    this.setIndex(this.path.index);
  }

  closeOnboarding() {
    this.completeOnboarding(true);
  }

  recordOnboardingInteractionEvent(type: TOnboardingInteractionEvent, data?: any) {
    this.usageStatisticsService.actions.recordAnalyticsEvent('Onboarding', {
      isUltra: this.userService.views.isPrime,
      hasExistingSceneCollections: this.hasExistingSceneCollections,
      hasOBSInstalled: this.obsImporterService.views.isOBSinstalled(),
      platforms: this.userService.views.linkedPlatforms,
      ...data,
      type,
    });
  }

  private initalizeView(config: IOnboardingInitialization) {
    this.windowsService.updateStyleBlockers('main', true);
    this.singletonPath = config.isSingleton;
    this.path = new OnboardingPath();
    this.path.append(config.startingStep);
    this.setCurrentStep(config.startingStep);
    this.setIndex(0);
    this.setShowOnboarding(true);
  }

  private determineSteps() {
    // Singleton paths dont have other steps
    if (this.singletonPath) return;
    // User is on the first step
    if (EOnboardingSteps.Splash === this.currentStepName) {
      // Entire recording mode path is determined here
      if (this.recordingModeService.views.isRecordingModeEnabled) {
        this.path.append({
          name: EOnboardingSteps.RecordingLogin,
          isSkippable: true,
          isClosable: true,
        });
        if (this.obsImporterService.views.isOBSinstalled()) {
          this.path.append({
            name: EOnboardingSteps.OBSImport,
            isSkippable: true,
            isClosable: true,
          });
        }
      } else {
        // Streaming mode path begins here
        this.path.append({ name: EOnboardingSteps.Login, isSkippable: true });
      }
    }
    // User has logged into streaming path, where the rest of the steps can be derived
    if (EOnboardingSteps.Login === this.currentStepName) {
      if (this.userService.views.isLoggedIn && this.userService.views.linkedPlatforms.length < 2) {
        this.path.append({
          name: EOnboardingSteps.ConnectMore,
          isSkippable: true,
          isClosable: true,
        });
      }
      if (this.obsImporterService.views.isOBSinstalled()) {
        this.path.append({
          name: EOnboardingSteps.OBSImport,
          isSkippable: true,
          isClosable: true,
        });
      }
      if (this.userService.views.isLoggedIn && !this.userService.views.isPrime) {
        this.path.append({ name: EOnboardingSteps.Ultra, isSkippable: true, isClosable: true });
      }
      this.path.append({ name: EOnboardingSteps.Devices, isSkippable: true, isClosable: true });
      if (this.userService.views.isLoggedIn && !this.hasExistingSceneCollections) {
        this.path.append({ name: EOnboardingSteps.Themes, isSkippable: true, isClosable: true });
      }
    }

    // Finally update the path length if necessary
    if (this.state.pathLength !== this.path.length) {
      this.setPathLength(this.path.length);
    }
  }

  private completeOnboarding(closedEarly?: boolean) {
    if (!this.singletonPath) {
      localStorage.setItem(this.localStorageKey, 'true');
      remote.session.defaultSession.flushStorageData();
      console.log('Set onboarding key successful.');
      this.recordOnboardingNavEvent(closedEarly ? 'closed' : 'completed');
      this.appService.actions.setOnboarded(true);
    }
    this.setShowOnboarding(false);
    this.windowsService.updateStyleBlockers('main', false);
    this.setCurrentStep(null);
    this.path = null;
  }

  private recordOnboardingNavEvent(type: TOnboardingNavigationEvent) {
    this.usageStatisticsService.actions.recordAnalyticsEvent('Onboarding', {
      type,
      currentStep: this.currentStepName,
      prevStep: this.path.prevStepName,
      nextStep: this.path.nextStepName,
      isUltra: this.userService.views.isPrime,
      hasExistingSceneCollections: this.hasExistingSceneCollections,
      hasOBSInstalled: this.obsImporterService.views.isOBSinstalled(),
      platforms: this.userService.views.linkedPlatforms,
    });
  }

  private setCurrentStep(step: IOnboardingStep | false) {
    if (!step) return;
    this.state.db.write(() => {
      this.state.currentStep = { isSkippable: false, isClosable: false, ...step };
    });
  }

  private setShowOnboarding(val: boolean) {
    this.state.db.write(() => (this.state.showOnboarding = val));
  }

  private setPathLength(length: number) {
    this.state.db.write(() => (this.state.pathLength = length));
  }

  private setIndex(val: number) {
    this.state.db.write(() => (this.state.currentIndex = val));
  }

  get hasExistingSceneCollections() {
    return !(
      this.sceneCollectionsService.loadableCollections.length === 1 &&
      this.sceneCollectionsService.loadableCollections[0].auto
    );
  }
}
