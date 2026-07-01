import { IGoLiveSettings, StreamInfoView, TDisplayOutput } from '../../../services/streaming';
import { maxNumPlatforms, platformList, TPlatform } from '../../../services/platforms';
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
import partition from 'lodash/partition';

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

  isUpdating: boolean = false;

  get settings(): IGoLiveSettingsState {
    return this.state;
  }

  /**
   * Update top level settings
   */
  updateSettings(patch: Partial<IGoLiveSettingsState>) {
    const newSettings = { ...this.state, ...patch };
    // we should re-calculate common fields before applying new settings
    const platforms = this.getViewFromState(newSettings).applyCommonFields(newSettings.platforms);
    const customDestinations = newSettings?.customDestinations;
    Object.assign(this.state, { ...newSettings, platforms, customDestinations });
  }
  /**
   * Update settings for a specific platform
   */
  updatePlatform(platform: TPlatform, patch: Partial<IGoLiveSettings['platforms'][TPlatform]>) {
    const updated = {
      platforms: {
        ...this.state.platforms,
        [platform]: { ...this.state.platforms[platform], ...patch },
      },
    };

    // In order for the enhanced broadcasting setting value to persist in the go live window when switching between
    // single output and dual output modes, explicitly set enhanced broadcasting setting
    if (platform === 'twitch' && patch && patch.hasOwnProperty('isEnhancedBroadcasting')) {
      Services.TwitchService.actions.setEnhancedBroadcasting((patch as any).isEnhancedBroadcasting);
    }

    this.updateSettings(updated);
  }

  getCanDualStream(platform: TPlatform) {
    if (platform === 'twitch') {
      return Services.TwitchService.views.hasTwitchDualStreamAccess;
    }
    return Services.StreamingService.views.supports('dualStream', [platform]);
  }

  switchPlatforms(enabledPlatforms: TPlatform[]) {
    if (this.isPrimaryPlatform('instagram') || this.isPrimaryPlatform('patreon')) {
      const newPrimary = enabledPlatforms.find(p => p !== 'instagram' && p !== 'patreon');
      if (newPrimary) {
        this.setPrimaryPlatform(newPrimary);
      }
    }

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
   * Set displays for recording
   * @remark Primarily used for dual output recording
   * @param display - Display to toggle
   * @param radioBtn - If true, the display will be the only one selected for recording
   */
  toggleRecordingDisplay(output: TDisplayOutput) {
    this.updateSettings({ recording: output });
  }

  /**
   * Enable/Disable Stream Shift mode
   */
  toggleStreamShift(status: boolean) {
    this.updateSettings({ streamShift: status });
  }

  /**
   * Enable/Disable Live Output Editing
   */
  toggleLiveOutputEditing(status: boolean) {
    this.updateSettings({ liveOutputEditing: status });
  }

  /**
   * Set a common field like title or description for all eligible platforms
   **/
  updateCommonFields(
    fields: { title: string; description: string },
    shouldChangeAllPlatforms = false,
  ) {
    (Object.keys(fields) as TCommonFieldName[]).forEach((fieldName: TCommonFieldName) => {
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

    // determine if TikTok apply notification should be shown
    Services.TikTokService.actions.handleApplyPrompt();

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

    // After async operations the Go Live window may have been closed,
    // destroying the state controller. Bail out if the module no longer exists.
    if (!this.state.getMetadata?.()) return;

    const prepopulateOptions = this.state.prepopulateOptions;
    const view = new StreamInfoView({});
    const settings: IGoLiveSettingsState = {
      ...view.savedSettings, // copy saved stream settings
      tweetText: view.getTweetText(view.commonFields.title), // generate a default tweet text
      needPrepopulate: false,
    };

    if (this.state.isUpdateMode && !view.isMidStreamMode) {
      (Object.keys(settings.platforms) as (keyof typeof settings.platforms)[]).forEach(
        (platform: TPlatform) => {
          // In multi-platform mode, allow deleting all platform settings, including primary
          if (!isMultiplatformMode && this.state.isPrimaryPlatform(platform)) {
            return;
          }

          delete settings.platforms[platform];
        },
      );
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

    /**
     * If the user is in dual output mode, we need to ensure the stream switcher is disabled
     */
    const { dualOutputMode } = DualOutputService.state;
    if (dualOutputMode && settings.streamShift) {
      settings.streamShift = false;
    }

    this.state.updateSettings(settings);

    /* If the user was in dual output before but doesn't have restream
     * we should disable one of the platforms if they have two enabled
     */
    const { canEnableRestream } = RestreamService.views;

    // Always enabled platforms can stay active
    const enabledPlatforms = this.state.enabledPlatforms.filter(
      platform => !this.state.alwaysEnabledPlatforms.includes(platform),
    );

    // Non-Ultra users can only have 2 targets enabled at a time, so if they have more than 2 enabled,
    // filter out a non-primary platform
    if (!canEnableRestream && enabledPlatforms.length > 2) {
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
    // If Patreon or Instagram is the current primary (merge-only / no chat),
    // promote any other enabled platform to primary so chat & stream-info
    // routing don't resolve to a non-streaming platform.
    if (this.state.isPrimaryPlatform('instagram') || this.state.isPrimaryPlatform('patreon')) {
      const newPrimary = enabledPlatforms.find(p => p !== 'instagram' && p !== 'patreon');
      if (newPrimary) {
        this.setPrimaryChat(newPrimary);
      }
    }

    this.state.linkedPlatforms.forEach(platform => {
      this.state.updatePlatform(platform, { enabled: enabledPlatforms.includes(platform) });
    });

    if (skipPrepopulate) return;

    /*
     * If there's exactly one enabled platform, set primaryChat to it,
     * ensures there's a primary platform if the user has multiple selected and then
     * deselects all but one.
     * Do not set merge-only platforms (Patreon, Instagram) as primary since they
     * cannot be used for authentication on app restart.
     */
    if (this.state.enabledPlatforms.length === 1) {
      const platform = this.state.enabledPlatforms[0];
      if (platform !== 'patreon' && platform !== 'instagram') {
        this.setPrimaryChat(platform);
      }
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

  /* Go live window has no persistence until we go live or toggle a platform on/off
   * As a result we don't get the latest state in any of its views.
   * This makes changing display immediate and is only used in `DisplaySelector`
   * to keep the rest of the code as before, but we might need to revisit that.
   */
  updatePlatformDisplayAndSaveSettings(platform: TPlatform, display: TDisplayOutput) {
    this.state.updatePlatform(platform, { display });
    this.save(this.state.settings);
  }

  setPlatformEnabled(platform: TPlatform, enabled: boolean) {
    this.state.updatePlatform(platform, { enabled });
    this.save(this.state.settings);
  }

  setCustomDestinationEnabled(index: number, enabled: boolean) {
    this.state.switchCustomDestination(index, enabled);
    this.save(this.state.settings);
  }

  updateCustomDestinationDisplayAndSaveSettings(destId: number, display: TDisplayType) {
    this.state.updateCustomDestinationDisplay(destId, display);
    this.save(this.state.settings);
  }

  updateRecordingDisplayAndSaveSettings(display: TDisplayOutput) {
    this.state.toggleRecordingDisplay(display);
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

  get unlinkedPlatforms() {
    const platforms = (platformList as TPlatform[]).filter(
      p => !this.state.linkedPlatforms.includes(p),
    );

    const [alwaysShown, unlinked] = partition(platforms, p =>
      this.state.alwaysShownPlatforms.includes(p),
    );
    return [...alwaysShown, ...unlinked];
  }

  get primaryPlatform() {
    return Services.UserService.views.platform?.type;
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

  setStreamShift(status: boolean) {
    this.state.toggleStreamShift(status);
    this.save(this.state.settings);
  }

  setLiveOutputEditingEnabled(status: boolean) {
    this.state.toggleLiveOutputEditing(status);
    this.save(this.state.settings);
  }

  getIsInvalidDualStream(): boolean {
    if (this.isPrime) {
      return false;
    }

    // Using the settings in the Go Live window's state, determine if the user
    // has set the output of any eligible platform to `both` to validate if
    // the user is trying to dual stream. Using the settings from the streaming
    // service views is not enough because the user may have changed them in the
    // Go Live window.
    const willDualStream = this.state.enabledPlatforms.some(
      (platform: TPlatform) =>
        this.state.getCanDualStream(platform) &&
        this.state.settings.platforms[platform]?.display === 'both',
    );

    const numTargets =
      this.state.enabledPlatforms.length + this.state.enabledCustomDestinationHosts.length;

    return this.state.isDualOutputMode && willDualStream && numTargets !== 1;
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
      // Show this allow users to attempt to go live with rtmp regardless of tiktok status
      message.info(
        $t("Couldn't confirm TikTok Live Access. Apply for Live Permissions below"),
        2,
        () => true,
      );
    }

    if (this.getIsInvalidDualStream()) {
      message.info($t('Upgrade to Ultra to allow more than two outputs'), 2, () => true);
      return;
    }

    if (!this.isPrime && this.state.isDualOutputMode) {
      const totalEnabled =
        this.state.enabledPlatforms.length +
        this.state.customDestinations.filter(d => d.enabled).length;
      if (totalEnabled >= 2) {
        const hasHorizontal = this.state.horizontalStream.length > 0;
        const hasVertical = this.state.verticalStream.length > 0;
        if (!hasHorizontal || !hasVertical) {
          message.info(
            $t(
              'Assign one destination to Horizontal and one to Vertical to go live, or upgrade to Ultra to enable multistreaming.',
            ),
            2,
            () => true,
          );
          return;
        }
      }
    }

    // Disable AI Highlighter if Twitch is not enabled, because it's a Twitch-only feature
    if (
      Services.HighlighterService.aiHighlighterFeatureEnabled &&
      !this.state.isEnabled('twitch')
    ) {
      Services.HighlighterService.actions.setAiHighlighter(false);
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

  get codec() {
    return Services.SettingsService.views.values.Output.Encoder;
  }

  get isPatreonEnabled() {
    return this.state.enabledPlatforms.some((p: TPlatform) => p === 'patreon');
  }

  get isStreamShiftDisabled() {
    if (!this.isPrime) return true;
    return this.isPatreonEnabled;
  }

  /**
   * Override the default behavior of toggling stream shift so that the user is still
   * able to toggle stream shift on/off when they have a single platform enabled and
   * that platform has its display set to 'both'. Otherwise, the isDualOutputMode check
   * would prevent the user from toggling stream shift on/off.
   * Note: This should never happen but is a failsafe in case something goes wrong with
   * the Go Live window's state.
   */
  get forceStreamShiftToggleEnabled() {
    return (
      this.state.isStreamShiftMode &&
      this.state.enabledPlatforms.length === 1 &&
      this.state.settings.platforms[this.state.enabledPlatforms[0]]?.display === 'both'
    );
  }

  get isLiveOutputEditingDisabled() {
    if (!this.isPrime) return true;
    return this.state.isStreamShiftMode;
  }

  get enabledPlatformsCount() {
    return this.state.enabledPlatforms.length;
  }

  get canAddDestinations() {
    return (
      this.state.linkedPlatforms.length + this.state.customDestinations.length < maxNumPlatforms + 5
    );
  }

  get showTopAddDestination() {
    return this.canAddDestinations && this.state.linkedPlatforms.length > 1;
  }

  get showBottomAddDestination() {
    return this.state.linkedPlatforms.length < 2;
  }

  get disableCustomDestinationSwitchers() {
    return (
      !this.isRestreamEnabled &&
      !this.state.enabledPlatforms.includes('tiktok') &&
      this.state.enabledPlatforms.length > 1
    );
  }

  get disableNonUltraSwitchers() {
    return (
      !this.isPrime && this.state.enabledPlatforms.length + this.enabledDestinations.length >= 2
    );
  }

  // Returns the label of the enabled platform with 'both' display selected, if any, for non-prime users.
  get nonPrimeBothDisplayPlatform(): TPlatform | null {
    if (this.isPrime) return null;
    return (
      this.state.enabledPlatforms.find(
        platform => this.state.settings.platforms[platform]?.display === 'both',
      ) ?? null
    );
  }

  get isAiHighlighterEnabled() {
    return Services.HighlighterService.aiHighlighterFeatureEnabled;
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
