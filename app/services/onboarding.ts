import * as remote from '@electron/remote';
import { Subject } from 'rxjs';
import { StatefulService, mutation } from 'services/core/stateful-service';
import { NavigationService } from 'services/navigation';
import { UserService } from 'services/user';
import { Inject, ViewHandler } from 'services/core/';
import { SceneCollectionsService } from 'services/scene-collections';
import { OS } from 'util/operating-systems';
import { $t } from './i18n';
import { jfetch } from 'util/requests';
import { getPlatformService } from './platforms';
import { OutputSettingsService } from './settings';
import { ObsImporterService } from './obs-importer';
import Utils from './utils';
import { RecordingModeService } from './recording-mode';
import { THEME_METADATA, IThemeMetadata } from './onboarding/theme-metadata';
export type { IThemeMetadata } from './onboarding/theme-metadata';
import { TwitchStudioImporterService } from './ts-importer';
import { DualOutputService } from 'services/dual-output';

enum EOnboardingSteps {
  MacPermissions = 'MacPermissions',
  StreamingOrRecording = 'StreamingOrRecording',
  Connect = 'Connect',
  PrimaryPlatformSelect = 'PrimaryPlatformSelect',
  FreshOrImport = 'FreshOrImport',
  ObsImport = 'ObsImport',
  HardwareSetup = 'HardwareSetup',
  ThemeSelector = 'ThemeSelector',
  // temporarily disable auto config until migrate to new api
  // Optimize = 'Optimize',
  Prime = 'Prime',
}

const isMac = () => process.platform === OS.Mac;

export const ONBOARDING_STEPS = () => ({
  [EOnboardingSteps.MacPermissions]: {
    component: 'MacPermissions' as const,
    hideButton: true,
    isPreboarding: true,
    cond: isMac,
    isSkippable: true,
  },
  [EOnboardingSteps.StreamingOrRecording]: {
    component: 'StreamingOrRecording' as const,
    hideButton: true,
    isPreboarding: true,
    isSkippable: false,
  },
  [EOnboardingSteps.Connect]: {
    component: 'Connect' as const,
    // Skippable for now, ideally will make non-skippable for beginners with a custom RTMP URL setup
    isSkippable: true,
    hideButton: true,
    isPreboarding: true,
  },
  [EOnboardingSteps.PrimaryPlatformSelect]: {
    component: 'PrimaryPlatformSelect' as const,
    hideButton: true,
    isPreboarding: true,
    cond: ({ isPartialSLAuth }: OnboardingStepContext) => isPartialSLAuth,
  },
  [EOnboardingSteps.FreshOrImport]: {
    component: 'FreshOrImport' as const,
    hideButton: true,
    isPreboarding: true,
    cond: ({
      isObsInstalled,
      isTwitchStudioInstalled,
      recordingModeEnabled,
    }: OnboardingStepContext) =>
      (isObsInstalled || isTwitchStudioInstalled) && !recordingModeEnabled,
  },
  [EOnboardingSteps.ObsImport]: {
    component: 'ObsImport' as const,
    hideButton: true,
    label: $t('Import'),
    cond: ({ importedFrom, isObsInstalled, isTwitchStudioInstalled }: OnboardingStepContext) =>
      importedFrom && (isObsInstalled || isTwitchStudioInstalled),
  },
  [EOnboardingSteps.HardwareSetup]: {
    component: 'HardwareSetup' as const,
    label: $t('Set Up Mic and Webcam'),
    cond: ({ importedFrom }: OnboardingStepContext) => !importedFrom,
    isSkippable: true,
  },
  [EOnboardingSteps.ThemeSelector]: {
    component: 'ThemeSelector' as const,
    hideButton: true,
    label: $t('Add a Theme'),
    cond: ({
      isLoggedIn,
      existingSceneCollections,
      importedFrom,
      recordingModeEnabled,
      platformSupportsThemes,
    }: OnboardingStepContext) =>
      !existingSceneCollections &&
      !importedFrom &&
      !recordingModeEnabled &&
      ((isLoggedIn && platformSupportsThemes) || !isLoggedIn),
    isSkippable: true,
  },
  // temporarily disable auto config until migrate to new api
  // [EOnboardingSteps.Optimize]: {
  //   component: 'Optimize' as const,
  //   disableControls: false,
  //   hideSkip: false,
  //   hideButton: true,
  //   label: $t('Optimize'),
  //   cond: ({ isTwitchAuthed, isYoutubeAuthed, recordingModeEnabled }: OnboardingStepContext) => isTwitchAuthed || isYoutubeAuthed || recordingModeEnabled,
  // },
  [EOnboardingSteps.Prime]: {
    component: 'Prime' as const,
    hideButton: true,
    label: $t('Ultra'),
    cond: ({ isUltra }: OnboardingStepContext) => !isUltra,
    isSkippable: true,
  },
});

export interface OnboardingStepContext {
  isPartialSLAuth: boolean;
  existingSceneCollections: boolean;
  isObsInstalled: boolean;
  isTwitchStudioInstalled: boolean;
  recordingModeEnabled: boolean;
  importedFrom: 'obs' | 'twitch';
  isLoggedIn: boolean;
  isUltra: boolean;
  platformSupportsThemes: boolean;
}

export interface IOnboardingStep {
  // Adding these explicitly so we don't accidentally do a comparison in some other components
  component:
    | 'MacPermissions'
    | 'StreamingOrRecording'
    | 'Connect'
    | 'PrimaryPlatformSelect'
    | 'FreshOrImport'
    | 'ObsImport'
    | 'HardwareSetup'
    | 'ThemeSelector'
    | 'Optimize'
    | 'Prime';
  hideButton?: boolean;
  label?: string;
  isPreboarding?: boolean;
  /** Predicate that returns whether this step should run, keeps steps declarative */
  cond?: (ctx: OnboardingStepContext) => boolean;
  isSkippable?: boolean | ((ctx: OnboardingStepContext) => boolean);
}

interface IOnboardingOptions {
  isLogin: boolean; // When logging into a new account after onboarding
  isOptimize: boolean; // When re-running the optimizer after onboarding
  // about our security upgrade.
  isHardware: boolean; // When configuring capture defaults
  isImport: boolean; // When users are importing from OBS
}

interface IOnboardingServiceState {
  options: IOnboardingOptions;
  importedFrom: 'obs' | 'twitch';
  existingSceneCollections: boolean;
}

class OnboardingViews extends ViewHandler<IOnboardingServiceState> {
  get singletonStep(): IOnboardingStep {
    if (this.state.options.isLogin) {
      if (this.getServiceViews(UserService).isPartialSLAuth) {
        return ONBOARDING_STEPS()[EOnboardingSteps.PrimaryPlatformSelect];
      }

      return ONBOARDING_STEPS()[EOnboardingSteps.Connect];
    }
    // temporarily disable auto config until migrate to new api
    // if (this.state.options.isOptimize) return ONBOARDING_STEPS()[EOnboardingSteps.Optimize];
    if (this.state.options.isHardware) return ONBOARDING_STEPS()[EOnboardingSteps.HardwareSetup];
    if (this.state.options.isImport) return ONBOARDING_STEPS()[EOnboardingSteps.ObsImport];
  }

  get steps() {
    const userViews = this.getServiceViews(UserService);
    const isOBSinstalled = this.getServiceViews(ObsImporterService).isOBSinstalled();
    const isTwitchStudioInstalled = this.getServiceViews(
      TwitchStudioImporterService,
    ).isTwitchStudioInstalled();
    const recordingModeEnabled = this.getServiceViews(RecordingModeService).isRecordingModeEnabled;

    const { existingSceneCollections, importedFrom } = this.state;
    const { isLoggedIn, isPrime: isUltra } = userViews;

    const ctx: OnboardingStepContext = {
      recordingModeEnabled,
      existingSceneCollections,
      importedFrom,
      isTwitchStudioInstalled,
      isLoggedIn,
      isUltra,
      isObsInstalled: isOBSinstalled,
      isPartialSLAuth: userViews.auth && userViews.isPartialSLAuth,
      platformSupportsThemes:
        isLoggedIn && getPlatformService(userViews.platform?.type)?.hasCapability('themes'),
    };

    return this.makeSteps(ctx);
  }

  get totalSteps() {
    return this.steps.length;
  }

  makeSteps(ctx: OnboardingStepContext) {
    const { getSteps } = this;

    return getSteps([
      EOnboardingSteps.MacPermissions,
      EOnboardingSteps.StreamingOrRecording,
      EOnboardingSteps.Connect,
      EOnboardingSteps.PrimaryPlatformSelect,
      EOnboardingSteps.FreshOrImport,
      EOnboardingSteps.ObsImport,
      EOnboardingSteps.HardwareSetup,
      EOnboardingSteps.ThemeSelector,
      EOnboardingSteps.Prime,
    ])(ctx);
  }

  getSteps(stepNames: EOnboardingSteps[]) {
    return (ctx: OnboardingStepContext): IOnboardingStep[] => {
      const steps = stepNames.map(step => ONBOARDING_STEPS()[step]);

      return steps.reduce((acc, step: IOnboardingStep) => {
        if (!step.cond || (step.cond && step.cond(ctx))) {
          // Lazy eval `isSkippable` in function form if the step's condition is met
          const isSkippable =
            typeof step.isSkippable === 'function' ? step.isSkippable(ctx) : step.isSkippable;

          acc.push({ ...step, isSkippable });
        }

        return acc;
      }, [] as IOnboardingStep[]);
    };
  }
}

export class OnboardingService extends StatefulService<IOnboardingServiceState> {
  static initialState: IOnboardingServiceState = {
    options: {
      isLogin: false,
      isOptimize: false,
      isHardware: false,
      isImport: false,
    },
    importedFrom: null,
    existingSceneCollections: false,
  };

  localStorageKey = 'UserHasBeenOnboarded';

  onboardingCompleted = new Subject();

  @Inject() navigationService: NavigationService;
  @Inject() userService: UserService;
  @Inject() sceneCollectionsService: SceneCollectionsService;
  @Inject() outputSettingsService: OutputSettingsService;
  @Inject() dualOutputService: DualOutputService;

  @mutation()
  SET_OPTIONS(options: Partial<IOnboardingOptions>) {
    Object.assign(this.state.options, options);
  }

  @mutation()
  SET_OBS_IMPORTED(val: 'obs' | 'twitch') {
    this.state.importedFrom = val;
  }

  @mutation()
  SET_EXISTING_COLLECTIONS(val: boolean) {
    this.state.existingSceneCollections = val;
  }

  async fetchThemeData(id: string) {
    const url = `https://overlays.streamlabs.com/api/overlay/${id}`;
    return jfetch<IThemeMetadata>(url);
  }

  async fetchThemes() {
    return await Promise.all(Object.keys(this.themeMetadata).map(id => this.fetchThemeData(id)));
  }

  get themeMetadata(): { [id: number]: string } {
    return this.userService.views.isPrime ? THEME_METADATA.PAID : THEME_METADATA.FREE;
  }

  themeUrl(id: number) {
    return this.themeMetadata[id];
  }

  get views() {
    return new OnboardingViews(this.state);
  }

  get options() {
    return this.state.options;
  }

  get existingSceneCollections() {
    return !(
      this.sceneCollectionsService.loadableCollections.length === 1 &&
      this.sceneCollectionsService.loadableCollections[0].auto
    );
  }

  get shouldAddDefaultSources() {
    // Add default sources if the user did not install a theme during onboarding
    if (!this.existingSceneCollections) return true;

    // Skip checking creation date for accounts in when testing
    if (Utils.isTestMode()) return false;

    // If the user does not have a creation date, they are a new user. Check to see if this
    // new user has installed a theme during onboarding
    const creationDate = this.userService.state?.createdAt;
    if (!creationDate && !this.existingSceneCollections) {
      return true;
    }

    // Otherwise, check if the user is within the first 6 hours of their
    // account creation date/time. This is last resort very rough check to determine
    // if the user is a new user. Not ideal but better than nothing.
    const now = new Date().getTime();
    const creationTime = new Date(creationDate).getTime();
    const millisecondsInAnHour = 1000 * 60 * 60;

    const isWithinCreationDateRange =
      creationTime < now && creationTime - now < millisecondsInAnHour * 6;

    return isWithinCreationDateRange && !this.existingSceneCollections;
  }

  init() {
    this.setExistingCollections();
  }

  setImport(val: 'obs' | 'twitch') {
    this.SET_OBS_IMPORTED(val);
  }

  setExistingCollections() {
    this.SET_EXISTING_COLLECTIONS(this.existingSceneCollections);
  }

  start(options: Partial<IOnboardingOptions> = {}) {
    const actualOptions: IOnboardingOptions = {
      isLogin: false,
      isOptimize: false,
      isHardware: false,
      isImport: false,
      ...options,
    };

    this.SET_OPTIONS(actualOptions);
    this.navigationService.navigate('Onboarding');
  }

  // Ends the onboarding process
  finish() {
    localStorage.setItem(this.localStorageKey, 'true');
    remote.session.defaultSession.flushStorageData();
    console.log('Set onboarding key successful.');

    // setup a custom resolution if the platform requires that
    const platformService = getPlatformService(this.userService.views.platform?.type);
    if (platformService && platformService.hasCapability('resolutionPreset')) {
      const { inputResolution, outputResolution } = platformService;
      this.outputSettingsService.setSettings({
        mode: 'Advanced',
        inputResolution,
        streaming: { outputResolution },
      });
    }

    // On their first login, new users should have a few default sources if they did not
    // select a scene collection during onboarding.
    if (this.sceneCollectionsService.newUserFirstLogin) {
      this.sceneCollectionsService.setupDefaultSources(this.shouldAddDefaultSources);
    }

    this.navigationService.navigate('Studio');
    this.onboardingCompleted.next();
  }

  get isTwitchAuthed() {
    return this.userService.isLoggedIn && this.userService.platform.type === 'twitch';
  }

  get isFacebookAuthed() {
    return this.userService.isLoggedIn && this.userService.platform.type === 'facebook';
  }

  startOnboardingIfRequired() {
    // Useful for testing in dev env
    if (Utils.env.SLD_FORCE_ONBOARDING_STEP) {
      this.start();
      return true;
    }

    if (localStorage.getItem(this.localStorageKey)) {
      return false;
    }

    this.start();
    return true;
  }
}
