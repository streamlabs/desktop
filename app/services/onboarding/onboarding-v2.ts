import { RealmObject } from 'services/realm';
import { ObjectSchema } from 'realm';
import * as remote from '@electron/remote';
import { Inject, Service } from 'services/core';
import {
  AppService,
  DualOutputService,
  ObsImporterService,
  RecordingModeService,
  SceneCollectionsService,
  SceneItem,
  ScenesService,
  SourcesService,
  StreamSettingsService,
  UsageStatisticsService,
  UserService,
  VideoSettingsService,
  WindowsService,
} from 'app-services';
import Utils from '../utils';

export enum EOnboardingSteps {
  Splash = 'Splash',
  YouTubeWelcome = 'YouTubeWelcome',
  YouTubeDualOutput = 'YouTubeDualOutput',
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
  | 'isPartialSLAuth'
  | 'isUltra'
  | 'obsInstalled'
  | 'lessThanTwoPlatforms'
  | 'hasSceneCollections'
  | 'youtubeOrigin';
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
   *
   * YouTube Origin (accelerated flow for installers downloaded from YouTube Studio)
   * YouTube Welcome (prompts YouTube login) -> YouTube Dual Output -> Setup Devices -> (done)
   * The YouTube Welcome screen is the entry point (Splash is skipped) and offers
   * a small escape hatch (exitYouTubeFlow) that drops the user into the normal
   * Login flow instead. The flow ends after Devices (Themes is skipped) and
   * completeOnboarding seeds the editor with the default sources.
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
      [EOnboardingSteps.YouTubeWelcome]: () => {
        // Escape hatch: the user dismissed the YouTube flow, send them to the
        // normal login screen and let the standard flow take over from there.
        if (!modifiers.youtubeOrigin) return { name: EOnboardingSteps.Login };
        // Logged in with YouTube on the welcome screen, continue accelerated flow.
        return { name: EOnboardingSteps.YouTubeDualOutput };
      },
      [EOnboardingSteps.YouTubeDualOutput]: () => ({ name: EOnboardingSteps.Devices }),
      [EOnboardingSteps.RecordingLogin]: () => {
        if (modifiers.obsInstalled) return { name: EOnboardingSteps.OBSImport };
      },
      // TODO: This is gross since there are 3 optional steps after Login but before Devices
      // and each one can lead to either of the others in line, there's gotta be a better way
      [EOnboardingSteps.Login]: () => {
        if ((modifiers.loggedIn || modifiers.isPartialSLAuth) && modifiers.lessThanTwoPlatforms) {
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
        // The YouTube flow ends after Devices, skipping Themes. Default sources
        // are seeded in completeOnboarding.
        if (modifiers.youtubeOrigin) return;
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
  @Inject() private dualOutputService: DualOutputService;
  @Inject() private scenesService: ScenesService;
  @Inject() private videoSettingsService: VideoSettingsService;
  @Inject() private sourcesService: SourcesService;
  @Inject() private streamSettingsService: StreamSettingsService;

  state = OnboardingServiceState.inject();

  path: OnboardingPath = null;
  singletonPath = false;
  localStorageKey = 'UserHasBeenOnboarded';

  // Set when the user opts out of the accelerated YouTube flow via the escape
  // hatch on the welcome screen. Disables the youtubeOrigin navigation modifier
  // so navigation falls back to the normal flow. Reset on each initalizeView.
  youtubeFlowDismissed = false;

  // Uncomment to debug/style a specific step
  // init() {
  //   super.init();
  //   this.initalizeView({ startingStep: { name: EOnboardingSteps.Ultra }, isSingleton: true });
  // }

  get currentStepName() {
    return this.state.currentStep.name;
  }

  // True when we're in the accelerated YouTube flow (YT-origin install that the
  // user hasn't opted out of via the escape hatch).
  get isYouTubeFlow() {
    return this.usageStatisticsService.youtubeOrigin && !this.youtubeFlowDismissed;
  }

  get modifiers(): TModifiers {
    return {
      loggedIn: this.userService.views.isLoggedIn,
      isPartialSLAuth: this.userService.views.isPartialSLAuth,
      isUltra: this.userService.views.isPrime,
      recordingMode: this.recordingModeService.views.isRecordingModeEnabled,
      obsInstalled: this.obsImporterService.views.isOBSinstalled(),
      lessThanTwoPlatforms: this.userService.views.linkedPlatforms.length < 2,
      hasSceneCollections: !!this.hasExistingSceneCollections,
      youtubeOrigin: this.isYouTubeFlow,
    };
  }

  /**
   * Opt out of the accelerated YouTube onboarding flow. Navigation then falls
   * back to the normal flow from the current step (i.e. the standard Login).
   */
  exitYouTubeFlow() {
    this.youtubeFlowDismissed = true;
    this.takeStep();
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
    // YouTube-origin installs land directly on the accelerated welcome screen,
    // skipping the standard splash. The flag is resolved during app startup
    // (AppService.load) so it's available synchronously here.
    const startingStep = this.usageStatisticsService.youtubeOrigin
      ? EOnboardingSteps.YouTubeWelcome
      : EOnboardingSteps.Splash;

    this.initalizeView({
      startingStep: { name: startingStep, isSkippable: false, isClosable: false },
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
    // Continuing past the Devices step adds a webcam to the scene. The YouTube
    // flow seeds its own sources (including a webcam) in seedDefaultCollection,
    // so skip this there to avoid a duplicate webcam.
    if (!skipped && this.currentStepName === EOnboardingSteps.Devices && !this.isYouTubeFlow) {
      this.recordingModeService.actions.addRecordingWebcam();
    }

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
    this.windowsService.actions.showModalLayer('main');
    this.youtubeFlowDismissed = false;
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

      // The YouTube flow skips the Themes step, so seed the editor with the
      // default sources a new user would get by skipping Themes.
      if (!closedEarly && this.isYouTubeFlow) {
        this.seedDefaultCollection();
      }
    }
    this.setShowOnboarding(false);
    this.windowsService.actions.hideModalLayer('main');
    this.setCurrentStep(null);
    this.path = null;
  }

  /**
   * Demo: always start from a fresh scene collection with the default sources
   * (Game Capture, Webcam, Alert Box). In production this should instead be
   * gated on `sceneCollectionsService.newUserFirstLogin` so we never overwrite
   * an existing user's collection.
   */
  private async seedDefaultCollection() {
    const dualOutputEnabled = this.dualOutputService.views.dualOutputMode;

    // Turn dual output off before creating the collection. Otherwise the new
    // (empty) collection is auto-converted to dual output on collectionSwitched
    // before we add the default sources, which marks it as a dual output
    // collection and prevents the default sources from getting vertical partner
    // nodes when we re-enable below.
    if (dualOutputEnabled) {
      this.dualOutputService.toggleDualOutputMode(false);
    }

    await this.sceneCollectionsService.create();
    this.sceneCollectionsService.setupDefaultSources(true);

    // Fit the game capture to the horizontal canvas.
    const horizontalGame = this.scenesService.views.activeScene
      ?.getItems()
      .find(item => item.display !== 'vertical' && item.getSource()?.name === 'Game Capture');
    horizontalGame?.fitToScreen('horizontal');

    if (dualOutputEnabled) {
      // Re-enable dual output to convert the now-populated single-output
      // collection so the default sources get vertical partner nodes. The
      // conversion runs in loading mode (async), so wait for collectionHandled
      // before arranging the vertical canvas, otherwise the partner nodes won't
      // exist yet.
      const sub = this.dualOutputService.collectionHandled.subscribe(() => {
        sub.unsubscribe();
        this.arrangeVerticalDefaultLayout();
        this.enableYouTubeOnBothDisplays();
      });
      this.dualOutputService.setDualOutputModeIfPossible(true, true);
    }
  }

  /**
   * Arrange the vertical partner nodes of the default sources into a sensible
   * portrait layout (they're otherwise all stacked in the top-left corner).
   * Game capture fills the top half, webcam the bottom half, and the alert box
   * is centered as an overlay.
   */
  private arrangeVerticalDefaultLayout() {
    const scene = this.scenesService.views.activeScene;
    if (!scene) return;

    const {
      baseWidth: width,
      baseHeight: height,
    } = this.videoSettingsService.baseResolutions.vertical;

    const verticalItems = scene.getItems().filter(item => item.display === 'vertical');
    const findItem = (name: string) => verticalItems.find(item => item.getSource()?.name === name);

    const game = findItem('Game Capture');
    const webcam = findItem('Webcam');
    const alertBox = findItem('Alert Box');

    // Game capture: full width, centered in the top half.
    if (game) {
      game.fitToScreen('vertical');
      const rect = game.getBoundingRect();
      game.setTransform({
        position: { x: (width - rect.width) / 2, y: (height / 2 - rect.height) / 2 },
      });
    }

    // Webcam: full width, centered in the bottom half. A freshly added webcam
    // source has no dimensions until its device initializes, so this waits for
    // the size before positioning (see placeVerticalWebcamWhenReady).
    if (webcam) {
      this.placeVerticalWebcamWhenReady(webcam);
    }

    // Alert box: centered overlay.
    if (alertBox) {
      alertBox.centerOnScreen('vertical');
    }
  }

  /**
   * Position the vertical webcam in the bottom half of the canvas. A freshly
   * created dshow/avcapture source reports its dimensions asynchronously, so
   * fitToScreen would produce a degenerate transform if called too early. Wait
   * for the source to report a size first.
   */
  private placeVerticalWebcamWhenReady(webcam: SceneItem) {
    const place = () => {
      const {
        baseWidth: width,
        baseHeight: height,
      } = this.videoSettingsService.baseResolutions.vertical;
      webcam.fitToScreen('vertical');
      const rect = webcam.getBoundingRect();
      webcam.setTransform({
        position: { x: (width - rect.width) / 2, y: height / 2 + (height / 2 - rect.height) / 2 },
      });
    };

    if (webcam.width && webcam.height) {
      place();
      return;
    }

    const sub = this.sourcesService.sourceUpdated.subscribe(source => {
      if (source.sourceId === webcam.sourceId && source.width && source.height) {
        sub.unsubscribe();
        place();
      }
    });

    // Stop waiting after 10s if the source never reports a size.
    setTimeout(() => sub.unsubscribe(), 10 * 1000);
  }

  /**
   * Pre-enable the YouTube destination on both the horizontal and vertical
   * displays so the user doesn't have to configure it in the go live window.
   */
  private enableYouTubeOnBothDisplays() {
    this.streamSettingsService.actions.setGoLiveSettings({
      platforms: {
        // Only enabled/display are persisted by setGoLiveSettings.
        youtube: { enabled: true, display: 'both' },
      },
    } as any);
  }

  private recordOnboardingNavEvent(type: TOnboardingNavigationEvent) {
    this.usageStatisticsService.actions.recordAnalyticsEvent('Onboarding', {
      type,
      currentStep: this.currentStepName,
      prevStep: this.path?.prevStepName,
      nextStep: this.path?.nextStepName,
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
