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

type TNavigationModifier =
  | 'recordingMode'
  | 'loggedIn'
  | 'isUltra'
  | 'obsInstalled'
  | 'lessThanTwoPlatforms'
  | 'hasSceneCollections';
type TModifiers = Record<TNavigationModifier, boolean>;

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
  private singletonPath = false;

  constructor(singletonPath?: boolean) {
    this.singletonPath = singletonPath;
  }

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
    const step = new OnboardingStep({ isSkippable: true, isClosable: true, ...config });
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
  takeNextStep(modifiers?: Record<TNavigationModifier, boolean>) {
    const nextStep = this.determineNextStep(modifiers);
    if (nextStep) this.append(nextStep);
    if (!this.current.next) return false;
    this.current = this.current.next;
    this.currentIndex += 1;
    return this.current.config;
  }

  // Returns false if at beginning of list and cannot go back further
  takePrevStep() {
    if (!this.current.prev) return false;
    this.current = this.current.prev;
    // Backtracking means we don't know what state they'll be in until they take another step
    this.current.next = null;
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
  private determineNextStep(
    modifiers?: Record<TNavigationModifier, boolean>,
  ): IOnboardingStep | void {
    if (this.singletonPath) return;
    const fromCurrentStep = {
      [EOnboardingSteps.Splash]: () => {
        if (modifiers.recordingMode) return { name: EOnboardingSteps.RecordingLogin };
        return { name: EOnboardingSteps.Login };
      },
      [EOnboardingSteps.RecordingLogin]: () => {
        if (modifiers.obsInstalled) return { name: EOnboardingSteps.OBSImport };
      },
      // TODO: This is gross since there are 3 optional steps after Login but before Devices
      // and each one can lead to either of the others in line, there's gotta be a better way
      [EOnboardingSteps.Login]: () => {
        if (modifiers.loggedIn && modifiers.lessThanTwoPlatforms) {
          return { name: EOnboardingSteps.ConnectMore };
        }
        if (modifiers.obsInstalled) return { name: EOnboardingSteps.OBSImport };
        if (modifiers.loggedIn && !modifiers.isUltra) return { name: EOnboardingSteps.Ultra };
        return { name: EOnboardingSteps.Devices };
      },
      [EOnboardingSteps.ConnectMore]: () => {
        if (modifiers.obsInstalled) return { name: EOnboardingSteps.OBSImport };
        if (modifiers.loggedIn && !modifiers.isUltra) return { name: EOnboardingSteps.Ultra };
        return { name: EOnboardingSteps.Devices };
      },
      [EOnboardingSteps.OBSImport]: () => {
        if (modifiers.loggedIn && !modifiers.isUltra) return { name: EOnboardingSteps.Ultra };
        return { name: EOnboardingSteps.Devices };
      },
      [EOnboardingSteps.Ultra]: () => ({ name: EOnboardingSteps.Devices }),
      [EOnboardingSteps.Devices]: () => {
        if (modifiers.loggedIn && !modifiers.hasSceneCollections) {
          return { name: EOnboardingSteps.Themes };
        }
      },
      [EOnboardingSteps.Themes]: () => {},
    };

    return fromCurrentStep[this.current.config.name]();
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

  path: OnboardingPath = null;
  singletonPath = false;
  localStorageKey = 'UserHasBeenOnboarded';

  get currentStepName() {
    return this.state.currentStep.name;
  }

  get modifiers(): TModifiers {
    return {
      loggedIn: this.userService.views.isLoggedIn,
      isUltra: this.userService.views.isPrime,
      recordingMode: this.recordingModeService.views.isRecordingModeEnabled,
      obsInstalled: this.obsImporterService.views.isOBSinstalled(),
      lessThanTwoPlatforms: this.userService.views.linkedPlatforms.length < 2,
      hasSceneCollections: !!this.hasExistingSceneCollections,
    };
  }

  showOnboardingIfNecessary() {
    if (
      !Utils.env.SLD_FORCE_ONBOARDING_STEP &&
      (this.userService.isAlphaGroup || localStorage.getItem(this.localStorageKey))
    ) {
      return;
    }
    this.appService.setOnboarded(true);
    this.showOnboarding();
  }

  showOnboarding() {
    this.initalizeView({
      startingStep: { name: EOnboardingSteps.Splash, isSkippable: false, isClosable: false },
      isSingleton: false,
    });
  }

  showLogin() {
    this.initalizeView({
      startingStep: { name: EOnboardingSteps.Login, isSkippable: false },
      isSingleton: true,
    });
  }

  showObsImport() {
    this.initalizeView({
      startingStep: { name: EOnboardingSteps.OBSImport, isSkippable: false },
      isSingleton: true,
    });
  }

  takeStep(skipped?: boolean) {
    this.recordOnboardingNavEvent(skipped ? 'skip' : 'continue');
    const nextStep = this.path.takeNextStep(this.modifiers);
    // if there are no additional steps we've reached the end of the path
    if (!nextStep) this.completeOnboarding();
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
    this.path = new OnboardingPath(config.isSingleton);
    this.path.append(config.startingStep);
    this.setCurrentStep(config.startingStep);
    this.setIndex(0);
    this.setShowOnboarding(true);
  }

  private completeOnboarding(closedEarly?: boolean) {
    if (!this.singletonPath) {
      localStorage.setItem(this.localStorageKey, 'true');
      remote.session.defaultSession.flushStorageData();
      console.log('Set onboarding key successful.');
      this.recordOnboardingNavEvent(closedEarly ? 'closed' : 'completed');
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
