import { IGoLiveSettings, StreamInfoView } from '../../../services/streaming';
import { TPlatform } from '../../../services/platforms';
import { TDisplayDestinations } from 'services/dual-output';
import { ICustomStreamDestination } from 'services/settings/streaming';
import { Services } from '../../service-provider';
import cloneDeep from 'lodash/cloneDeep';
import { FormInstance } from 'antd/lib/form';
import { message } from 'antd';
import { $t } from '../../../services/i18n';
import { injectState, useModule } from 'slap';
import { useForm } from '../../shared/inputs/Form';
import { getDefined } from '../../../util/properties-type-guards';
import isEqual from 'lodash/isEqual';
import { TDisplayType } from 'services/settings-v2';

type TCommonFieldName = 'title' | 'description';

export type TModificators = { isUpdateMode?: boolean; isScheduleMode?: boolean };
export type IGoLiveSettingsState = IGoLiveSettings & TModificators & { needPrepopulate: boolean };

class GoLiveSettingsState extends StreamInfoView<IGoLiveSettingsState> {
  state: IGoLiveSettingsState = {
    optimizedProfile: undefined,
    tweetText: '',
    isUpdateMode: false,
    needPrepopulate: true,
    prepopulateOptions: undefined,
    ...this.savedSettings,
  };

  isUpdating: boolean;

  get settings(): IGoLiveSettingsState {
    return this.state;
  }

  get alwaysEnabledPlatforms(): TPlatform[] {
    return ['tiktok'];
  }

  /*
   * Primary used to get all platforms that should always show the destination switcher in the Go Live window
   */
  get alwaysShownPlatforms(): TPlatform[] {
    return ['kick'];
  }

  /**
   * Update top level settings
   */
  updateSettings(patch: Partial<IGoLiveSettingsState>) {
    if (patch.platforms?.twitch) {
      Services.SettingsService.actions.setEnhancedBroadcasting(
        patch.platforms.twitch.isEnhancedBroadcasting,
      );
    }

    const newSettings = { ...this.state, ...patch };
    // we should re-calculate common fields before applying new settings
    const platforms = this.getViewFromState(newSettings).applyCommonFields(newSettings.platforms);
    const customDestinations = newSettings?.customDestinations;
    Object.assign(this.state, { ...newSettings, platforms, customDestinations });
  }
  /**
   * Update settings for a specific platforms
   */
  updatePlatform(platform: TPlatform, patch: Partial<IGoLiveSettings['platforms'][TPlatform]>) {
    const updated = {
      platforms: {
        ...this.state.platforms,
        [platform]: { ...this.state.platforms[platform], ...patch },
      },
    };
    this.updateSettings(updated);
  }

  switchPlatforms(enabledPlatforms: TPlatform[]) {
    this.linkedPlatforms.forEach(platform => {
      this.updatePlatform(platform, { enabled: enabledPlatforms.includes(platform) });
    });
  }

  /**
   * Enable/disable a custom ingest destinations
   */
  switchCustomDestination(destInd: number, enabled: boolean) {
    const customDestinations = cloneDeep(this.getView().customDestinations);
    customDestinations[destInd].enabled = enabled;
    this.updateSettings({ customDestinations });
  }

  updateCustomDestinationDisplay(destInd: number, display: TDisplayType) {
    const customDestinations = cloneDeep(this.getView().customDestinations);
    customDestinations[destInd].display = display;
    this.updateSettings({ customDestinations });
  }

  /**
   * Show/hide custom ingest destination card in go live window
   */
  toggleDestination(index: number, enabled: boolean) {
    // this timeout is to allow for the toggle animation
    setTimeout(() => this.switchCustomDestination(index, enabled), 500);
  }

  /**
   * Get platform enabled status
   */
  isEnabled(platform: TPlatform) {
    return this.enabledPlatforms.includes(platform);
  }

  /**
   * Switch Advanced or Simple mode
   */
  switchAdvancedMode(enabled: boolean) {
    this.updateSettings({ advancedMode: enabled });

    // reset common fields for all platforms in simple mode
    if (!enabled) this.updateCommonFields(this.getView().commonFields);
  }
  /**
   * Set a common field like title or description for all eligible platforms
   **/
  updateCommonFields(
    fields: { title: string; description: string },
    shouldChangeAllPlatforms = false,
  ) {
    Object.keys(fields).forEach((fieldName: TCommonFieldName) => {
      const view = this.getView();
      const value = fields[fieldName];
      const platforms = shouldChangeAllPlatforms
        ? view.platformsWithoutCustomFields
        : view.enabledPlatforms;
      platforms.forEach(platform => {
        if (!view.supports(fieldName, [platform])) return;
        const platformSettings = getDefined(this.state.platforms[platform]);
        (platformSettings as Record<TCommonFieldName, string>)[fieldName] = value;
      });
    });
  }

  get isLoading() {
    const state = this.state;
    return state.needPrepopulate || this.getViewFromState(state).isLoading || this.isUpdating;
  }

  getView() {
    return this;
  }

  getViewFromState(state: IGoLiveSettingsState) {
    return new StreamInfoView(state);
  }
}

/**
 * Extend GoLiveSettingsModule from StreamInfoView
 * So all getters from StreamInfoView will be available in GoLiveSettingsModule
 */
export class GoLiveSettingsModule {
  // define initial state
  state = injectState(GoLiveSettingsState);

  constructor(public form: FormInstance, public isUpdateMode: boolean) {}

  // initial setup
  async init() {
    // take prefill options from the windows' `queryParams`
    const windowParams = Services.WindowsService.state.child.queryParams as unknown;
    if (windowParams && !isEqual(windowParams, {})) {
      getDefined(this.state.setPrepopulateOptions)(
        windowParams as IGoLiveSettings['prepopulateOptions'],
      );
    }
    await this.prepopulate();
  }

  /**
   * Fetch settings for each platform
   */
  async prepopulate() {
    const { StreamingService, RestreamService, DualOutputService } = Services;
    const { isMultiplatformMode } = StreamingService.views;

    this.state.setNeedPrepopulate(true);
    await StreamingService.actions.return.prepopulateInfo();
    // TODO investigate mutation order issue
    await new Promise(r => setTimeout(r, 100));

    const prepopulateOptions = this.state.prepopulateOptions;
    const view = new StreamInfoView({});
    const settings: IGoLiveSettingsState = {
      ...view.savedSettings, // copy saved stream settings
      tweetText: view.getTweetText(view.commonFields.title), // generate a default tweet text
      needPrepopulate: false,
    };

    if (this.state.isUpdateMode && !view.isMidStreamMode) {
      Object.keys(settings.platforms).forEach((platform: TPlatform) => {
        // In multi-platform mode, allow deleting all platform settings, including primary
        if (!isMultiplatformMode && this.state.isPrimaryPlatform(platform)) {
          return;
        }

        delete settings.platforms[platform];
      });
    }

    // prefill the form if `prepopulateOptions` provided
    if (prepopulateOptions) {
      Object.keys(prepopulateOptions).forEach(platform => {
        Object.assign(
          (settings.platforms as Record<string, any>)[platform],
          prepopulateOptions[platform as keyof typeof prepopulateOptions],
        );
      });
    }

    this.state.updateSettings(settings);

    /* If the user was in dual output before but doesn't have restream
     * we should disable one of the platforms if they have two enabled
     */
    const { dualOutputMode } = DualOutputService.state;
    const { canEnableRestream } = RestreamService.views;

    // Tiktok and Kick can stay active
    const enabledPlatforms = this.state.enabledPlatforms.filter(
      platform => !this.state.alwaysEnabledPlatforms.includes(platform),
    );

    if (!dualOutputMode && !canEnableRestream && enabledPlatforms.length > 1) {
      /* Find the platform that was set as primary chat to remain enabled,
       * if for some reason we fail to find it default to the last selected platform
       */
      const platform =
        enabledPlatforms.find(platform => platform === this.primaryChat) ||
        enabledPlatforms[enabledPlatforms.length - 1];

      this.switchPlatforms([platform]);
    }
  }

  get isPrime() {
    return Services.UserService.isPrime;
  }

  /**
   * Get go live settings
   */
  getSettings() {
    return this.state.settings;
  }

  /**
   * Save current settings so we can use it next time we open the GoLiveWindow
   */
  save(settings: IGoLiveSettingsState) {
    Services.StreamSettingsService.actions.return.setGoLiveSettings(settings);
  }

  /**
   * Switch platforms on/off and save settings
   * If platform is enabled then prepopulate its settings
   */
  switchPlatforms(enabledPlatforms: TPlatform[], skipPrepopulate?: boolean) {
    this.state.linkedPlatforms.forEach(platform => {
      this.state.updatePlatform(platform, { enabled: enabledPlatforms.includes(platform) });
    });

    if (skipPrepopulate) return;

    /*
     * If there's exactly one enabled platform, set primaryChat to it,
     * ensures there's a primary platform if the user has multiple selected and then
     * deselects all but one
     */
    if (this.state.enabledPlatforms.length === 1) {
      this.setPrimaryChat(this.state.enabledPlatforms[0]);
    }
    /*
     * This should only trigger on free user mode: when toggling another platform
     * when TikTok is enabled, set primary chat to that platform instead of TikTok
     */
    if (
      this.state.enabledPlatforms.length === 2 &&
      this.state.enabledPlatforms.includes('tiktok')
    ) {
      const otherPlatform = this.state.enabledPlatforms.find(platform => platform !== 'tiktok');

      // This is always true, but to make TS happy and code explicit, we null check here
      if (otherPlatform) {
        this.setPrimaryChat(otherPlatform);
      }
    }

    this.save(this.state.settings);
    this.prepopulate();
  }

  switchCustomDestination(destInd: number, enabled: boolean) {
    this.state.switchCustomDestination(destInd, enabled);
    this.save(this.state.settings);
  }

  get enabledDestinations() {
    return this.state.customDestinations.reduce(
      (enabled: number[], dest: ICustomStreamDestination, index: number) => {
        if (dest.enabled) enabled.push(index);
        return enabled;
      },
      [],
    );
  }
  get primaryChat() {
    const primaryPlatform = Services.UserService.views.platform!;
    // this is migration-like code for users with old primary platform deselected (i.e me)
    if (!this.state.enabledPlatforms.includes(primaryPlatform.type)) {
      return this.state.enabledPlatforms[0];
    }

    return Services.UserService.views.platform!.type;
  }

  setPrimaryChat(platform: TPlatform) {
    Services.UserService.actions.setPrimaryPlatform(platform);
  }

  /**
   * Determine if all dual output go live requirements are fulfilled
   */
  getCanStreamDualOutput() {
    return this.state.getCanStreamDualOutput(this.state);
  }

  /**
   * Validate the form and show an error message
   */
  async validate() {
    // tiktok live authorization error
    if (
      this.state.isEnabled('tiktok') &&
      (Services.TikTokService.neverApplied || Services.TikTokService.denied)
    ) {
      // TODO: this is a patch to allow users to attempt to go live with rtmp regardless of tiktok status
      return message.info(
        $t("Couldn't confirm TikTok Live Access. Apply for Live Permissions below"),
        2,
        () => true,
      );
    }

    try {
      await getDefined(this.form).validateFields();
      return true;
    } catch (e: unknown) {
      message.error($t('Invalid settings. Please check the form'));
      return false;
    }
  }

  /**
   * Validate the form and start streaming
   */
  async goLive() {
    if (await this.validate()) {
      Services.StreamingService.actions.goLive(this.state.settings);
    }
  }
  /**
   * Validate the form and send new settings for each eligible platform
   */
  async updateStream() {
    if (
      (await this.validate()) &&
      (await Services.StreamingService.actions.return.updateStreamSettings(this.state.settings))
    ) {
      message.success($t('Successfully updated'));
    }
  }

  /**
   * Returns whether the user has any active destinations, be it an enabled platform or a custom destination
   */
  get hasDestinations() {
    return this.state.enabledPlatforms.length > 0 || this.state.customDestinations.length > 0;
  }

  get hasMultiplePlatforms() {
    return this.state.enabledPlatforms.length > 1;
  }

  get isRestreamEnabled() {
    return Services.RestreamService.views.canEnableRestream;
  }

  get recommendedColorSpaceWarnings() {
    return Services.SettingsService.views.recommendedColorSpaceWarnings;
  }
}

export function useGoLiveSettings() {
  return useModule(GoLiveSettingsModule);
}

export function useGoLiveSettingsRoot(params?: { isUpdateMode: boolean }) {
  const form = useForm();

  const useModuleResult = useModule(GoLiveSettingsModule, [form, !!params?.isUpdateMode]);
  return useModuleResult;
}
