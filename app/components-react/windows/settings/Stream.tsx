import React, { useMemo, useState } from 'react';
import { $t } from '../../../services/i18n';
import { ICustomStreamDestination } from '../../../services/settings/streaming';
import { EStreamingState } from '../../../services/streaming';
import {
  EPlatformCallResult,
  externalAuthPlatforms,
  getPlatformService,
  TPlatform,
} from '../../../services/platforms';
import cloneDeep from 'lodash/cloneDeep';
import namingHelpers from '../../../util/NamingHelpers';
import { Services } from '../../service-provider';
import { ObsGenericSettingsForm } from './ObsSettings';
import css from './Stream.m.less';
import cx from 'classnames';
import { Button, message, Tooltip } from 'antd';
import PlatformLogo from '../../shared/PlatformLogo';
import { injectState, mutation, useModule } from 'slap';
import UltraIcon from 'components-react/shared/UltraIcon';
import ButtonHighlighted from 'components-react/shared/ButtonHighlighted';
import { useVuex } from 'components-react/hooks';
import Translate from 'components-react/shared/Translate';
import * as remote from '@electron/remote';
import { InstagramEditStreamInfo } from '../go-live/platforms/InstagramEditStreamInfo';
import { IInstagramStartStreamOptions } from 'services/platforms/instagram';
import { metadata } from 'components-react/shared/inputs/metadata';
import FormFactory, { TInputValue } from 'components-react/shared/inputs/FormFactory';
import { alertAsync } from '../../modals';
import { EAuthProcessState } from '../../../services/user';

function censorWord(str: string) {
  if (str.length < 3) return str;
  return str[0] + '*'.repeat(str.length - 2) + str.slice(-1);
}

function censorEmail(str: string) {
  const parts = str.split('@');
  return censorWord(parts[0]) + '@' + censorWord(parts[1]);
}

/**
 * A Redux module for components in the StreamSetting window
 */
class StreamSettingsModule {
  constructor() {
    const showMessage = (msg: string, success: boolean) => {
      message.config({
        duration: 6,
        maxCount: 1,
      });

      if (success) {
        message.success(msg);
      } else {
        message.error(msg);
      }
    };
    Services.UserService.refreshedLinkedAccounts.subscribe(
      (res: { success: boolean; message: string }) => {
        const doShowMessage = () => showMessage(res.message, res.success);
        /*
         * Since the settings window pops out anyways (presumably because of
         * using `message`make sure it is at least on the right page, as opposed
         * to in an infinite loading blank window state.
         */
        doShowMessage();
      },
    );
  }

  // DEFINE A STATE
  state = injectState({
    // false = edit mode off
    // true = add custom destination mode
    // number = edit custom destination mode where number is the index of the destination
    editCustomDestMode: false as boolean | number,

    // form data
    customDestForm: {
      name: '',
      url: '',
      streamKey: '',
      enabled: false,
    } as ICustomStreamDestination,
  });

  // INJECT SERVICES

  private get streamSettingsService() {
    return Services.StreamSettingsService;
  }
  private get userService() {
    return Services.UserService;
  }
  private get navigationService() {
    return Services.NavigationService;
  }
  private get windowsService() {
    return Services.WindowsService;
  }
  private get streamingService() {
    return Services.StreamingService;
  }
  private get magicLinkService() {
    return Services.MagicLinkService;
  }
  private get customizationService() {
    return Services.CustomizationService;
  }

  // DEFINE MUTATIONS

  @mutation()
  editCustomDest(ind: number) {
    this.state.customDestForm = cloneDeep(this.customDestinations[ind]);
    this.state.editCustomDestMode = ind;
  }

  @mutation()
  addCustomDest(linkToPrime: boolean = false) {
    if (linkToPrime) {
      this.magicLinkService.actions.linkToPrime('slobs-multistream');
      return;
    }
    const name: string = this.suggestCustomDestName();
    this.state.customDestForm = {
      name,
      streamKey: '',
      url: '',
      enabled: false,
    };
    this.state.editCustomDestMode = true;
  }

  removeCustomDest(ind: number) {
    const destinations = cloneDeep(this.customDestinations);
    destinations.splice(ind, 1);
    this.streamSettingsService.setGoLiveSettings({ customDestinations: destinations });
  }

  @mutation()
  stopEditing() {
    this.state.editCustomDestMode = false;
  }

  @mutation()
  updateCustomDestForm(updatedFields: Partial<ICustomStreamDestination>) {
    this.state.customDestForm = { ...this.state.customDestForm, ...updatedFields };
  }

  @mutation()
  private fixUrl() {
    // add "/" to the end of url string
    if (
      this.state.customDestForm.streamKey &&
      this.state.customDestForm.url.charAt(this.state.customDestForm.url.length - 1) !== '/'
    ) {
      this.state.customDestForm.url += '/';
    }
  }

  // DEFINE ACTIONS AND GETTERS

  get formValues() {
    return {
      url: this.state.customDestForm.url,
      streamKey: this.state.customDestForm.streamKey || '',
      name: this.state.customDestForm.name,
    };
  }

  get platforms() {
    return this.streamingView.allPlatforms.filter(platform => {
      return true;
    });
  }

  get isPrime() {
    return this.userService.isPrime;
  }

  disableProtectedMode() {
    this.streamSettingsService.actions.setSettings({ protectedModeEnabled: false });
  }

  enableProtectedMode() {
    this.streamSettingsService.actions.setSettings({
      protectedModeEnabled: true,
      key: '',
      streamType: 'rtmp_common',
    });
  }

  get protectedModeEnabled(): boolean {
    return this.streamSettingsService.protectedModeEnabled;
  }

  get streamingView() {
    return this.streamingService.views;
  }

  get needToShowWarning() {
    return this.userService.isLoggedIn && !this.protectedModeEnabled;
  }

  get canEditSettings() {
    return this.streamingService.state.streamingStatus === EStreamingState.Offline;
  }

  get customDestinations() {
    return this.streamingView.savedSettings.customDestinations;
  }

  get isDarkTheme() {
    return this.customizationService.isDarkTheme;
  }

  platformMerge(platform: TPlatform) {
    this.navigationService.navigate('PlatformMerge', { platform });
    this.windowsService.actions.closeChildWindow();
  }

  async platformMergeInline(platform: TPlatform) {
    const mode = externalAuthPlatforms.includes(platform) ? 'external' : 'internal';

    await Services.UserService.actions.return.startAuth(platform, mode, true).then(res => {
      Services.WindowsService.actions.setWindowOnTop('child');
      if (res === EPlatformCallResult.Error) {
        alertAsync(
          $t(
            'This account is already linked to another Streamlabs Account. Please use a different account.',
          ),
        );
        return;
      }

      Services.StreamSettingsService.actions.setSettings({ protectedModeEnabled: true });
    });
  }

  platformUnlink(platform: TPlatform) {
    getPlatformService(platform).unlink();
  }

  async saveCustomDest() {
    if (!this.state.customDestForm.url.includes('?')) {
      // if the url contains parameters, don't add a trailing /
      this.fixUrl();
    }

    const destinations = cloneDeep(this.customDestinations);
    const isUpdateMode = typeof this.state.editCustomDestMode === 'number';
    if (isUpdateMode) {
      const ind = this.state.editCustomDestMode as number;
      // preserve destination display setting or set to horizontal by default
      const display = destinations[ind]?.display ?? 'horizontal';
      destinations.splice(ind, 1, { ...this.state.customDestForm, display });
    } else {
      // set display to horizontal by default
      destinations.push({ ...this.state.customDestForm, display: 'horizontal' });
    }
    this.streamSettingsService.setGoLiveSettings({ customDestinations: destinations });
    this.stopEditing();
  }

  private suggestCustomDestName() {
    const destinations = this.customDestinations;
    return namingHelpers.suggestName($t('Destination'), (name: string) =>
      destinations.find(dest => dest.name === name),
    );
  }
}

// wrap the module into a React hook
function useStreamSettings() {
  return useModule(StreamSettingsModule);
}

/**
 * A root component for StreamSettings
 */
export function StreamSettings() {
  const {
    platforms,
    protectedModeEnabled,
    canEditSettings,
    disableProtectedMode,
    needToShowWarning,
    enableProtectedMode,
  } = useModule(StreamSettingsModule);

  return (
    <div className={css.section}>
      {/* account info */}
      {protectedModeEnabled && (
        <div>
          <h2>{$t('Streamlabs ID')}</h2>
          <SLIDBlock />
          <h2>{$t('Stream Destinations')}</h2>
          {platforms.map(platform => (
            <Platform key={platform} platform={platform} />
          ))}

          <CustomDestinationList />

          {canEditSettings && (
            <p>
              <br />
              <a onClick={disableProtectedMode}>{$t('Stream to custom ingest')}</a>
            </p>
          )}
        </div>
      )}

      {/* WARNING messages */}
      {!canEditSettings && (
        <div className="section section--warning">
          {$t("You can not change these settings when you're live")}
        </div>
      )}
      {needToShowWarning && (
        <div className="section section--warning">
          <b>{$t('Warning')}: </b>
          {$t(
            'Streaming to a custom ingest is advanced functionality. Some features may stop working as expected',
          )}
          <br />
          <br />

          {canEditSettings && (
            <button className="button button--warn" onClick={enableProtectedMode}>
              {$t('Use recommended settings')}
            </button>
          )}
        </div>
      )}

      {/* OBS settings */}
      {!protectedModeEnabled && canEditSettings && <ObsGenericSettingsForm />}
    </div>
  );
}

StreamSettings.page = 'Stream';

function SLIDBlock() {
  const { UserService, SettingsService } = Services;
  const { hasSLID, username } = useVuex(() => ({
    hasSLID: UserService.views.hasSLID,
    username: UserService.views.auth?.slid?.username,
  }));

  function openPasswordLink() {
    remote.shell.openExternal('https://id.streamlabs.com/security/password?companyId=streamlabs');
  }

  function openTwoFactorLink() {
    remote.shell.openExternal('https://id.streamlabs.com/security/tfa?companyId=streamlabs');
  }

  async function mergeSLID() {
    const resp = await UserService.actions.return.startSLMerge();
    if (resp !== EPlatformCallResult.Success) return;
    SettingsService.actions.showSettings('Stream');
  }

  return (
    <div className="section">
      <div className="flex">
        <div className="margin-right--20" style={{ width: '50px' }}>
          <PlatformLogo className={css.platformLogo} size="medium" platform="streamlabs" />
        </div>
        <div>
          {hasSLID ? (
            <div>
              Streamlabs <br />
              {username && <b>{censorEmail(username)}</b>}
            </div>
          ) : (
            <Translate message={$t('slidConnectMessage')} />
          )}
        </div>
        {!hasSLID && (
          <Button type="primary" onClick={mergeSLID}>
            {$t('Setup')}
          </Button>
        )}
      </div>
      {hasSLID && (
        <div
          style={{ margin: '10px -16px', height: 2, backgroundColor: 'var(--background)' }}
        ></div>
      )}
      {hasSLID && (
        <div style={{ display: 'flex', justifyContent: 'right' }}>
          <a
            style={{ fontWeight: 400, marginRight: 10, textDecoration: 'underline' }}
            onClick={openPasswordLink}
          >
            {$t('Update Password')}
          </a>
          <a style={{ fontWeight: 400, textDecoration: 'underline' }} onClick={openTwoFactorLink}>
            {$t('Update Two-factor Auth')}
          </a>
        </div>
      )}
    </div>
  );
}

/**
 * Renders a Platform placeholder
 */
function Platform(p: { platform: TPlatform }) {
  const platform = p.platform;
  const { UserService, StreamingService, InstagramService } = Services;
  const { canEditSettings, platformMergeInline, platformUnlink } = useStreamSettings();

  const { isLoading, authInProgress, instagramSettings } = useVuex(() => ({
    isLoading: UserService.state.authProcessState === EAuthProcessState.Loading,
    authInProgress: UserService.state.authProcessState === EAuthProcessState.InProgress,
    instagramSettings: InstagramService.state.settings,
  }));

  const isMerged = StreamingService.views.isPlatformLinked(platform);
  const platformObj = UserService.state.auth!.platforms[platform];
  const username = platformObj?.username;
  const platformName = useMemo(() => getPlatformService(platform).displayName, []);
  const isPrimary = StreamingService.views.isPrimaryPlatform(platform);
  const shouldShowPrimaryBtn = isPrimary;
  const shouldShowConnectBtn = !isMerged && canEditSettings;
  const shouldShowUnlinkBtn = !isPrimary && isMerged && canEditSettings;

  /*
   * TODO: don't really see much value in having Instagram text boxes here, since
   * user needs to re-enter stream key every time they go live anyways, makes code brittle,
   * but since we're adding it, might as well make other small changes to make it look better
   */
  const isInstagram = platform === 'instagram';
  const [showInstagramFields, setShowInstagramFields] = useState(isInstagram && isMerged);
  const shouldShowUsername = !isInstagram;

  const usernameOrBlank = shouldShowUsername ? (
    <>
      <br />
      {username}
      <br />
    </>
  ) : (
    ''
  );

  const instagramConnect = async () => {
    const success = await UserService.actions.return.startAuth(platform, 'internal', true);
    if (!success) return;
    setShowInstagramFields(true);
  };

  const instagramUnlink = () => {
    // 1. reset stream key and url after unlinking if the user chooses to re-link immediately
    updateInstagramSettings({ title: '', streamKey: '', streamUrl: '' });
    // 2. hide extra fields
    setShowInstagramFields(false);
    // 3. unlink platform
    platformUnlink(platform);
  };

  const ConnectButton = () => (
    <span>
      <Button
        onClick={isInstagram ? instagramConnect : () => platformMergeInline(platform)}
        className={cx({ [css.tiktokConnectBtn]: platform === 'tiktok' })}
        disabled={isLoading || authInProgress}
        style={{
          backgroundColor: `var(--${platform})`,
          borderColor: 'transparent',
          color: ['trovo', 'instagram', 'kick'].includes(platform) ? 'black' : 'inherit',
        }}
      >
        {$t('Connect')}
      </Button>
    </span>
  );

  const updateInstagramSettings = (newSettings: IInstagramStartStreamOptions) => {
    InstagramService.actions.updateSettings(newSettings);
  };

  const ExtraFieldsSection = () => {
    if (isInstagram && showInstagramFields) {
      return (
        <div className={cx(css.extraFieldsSection)}>
          <InstagramEditStreamInfo
            onChange={updateInstagramSettings}
            value={instagramSettings}
            layoutMode="singlePlatform"
            isStreamSettingsWindow
          />
        </div>
      );
    }
    return null;
  };

  return (
    <div className="section flex" style={{ marginBottom: 16, flexDirection: 'column' }}>
      <div className="flex">
        <div className="margin-right--20" style={{ width: '50px' }}>
          <PlatformLogo className={css.platformLogo} size={50} platform={platform} />
        </div>

        <div style={{ alignSelf: 'center' }}>
          {platformName}
          {isMerged ? (
            usernameOrBlank
          ) : (
            <>
              <br />
              <span style={{ opacity: '0.5' }}>{$t('unlinked')}</span>
              <br />
            </>
          )}
        </div>

        <div style={{ marginLeft: 'auto' }}>
          {shouldShowConnectBtn && <ConnectButton />}
          {shouldShowUnlinkBtn && (
            <Button
              danger
              onClick={() => (isInstagram ? instagramUnlink() : platformUnlink(platform))}
            >
              {$t('Unlink')}
            </Button>
          )}
          {shouldShowPrimaryBtn && (
            <Tooltip
              title={$t(
                'You cannot unlink the platform you used to sign in to Streamlabs Desktop. If you want to unlink this platform, please sign in with a different platform.',
              )}
            >
              <Button disabled={true} type="primary">
                {$t('Logged in')}
              </Button>
            </Tooltip>
          )}
        </div>
      </div>

      <ExtraFieldsSection />
    </div>
  );
}

/**
 * Renders a custom destinations list
 */
function CustomDestinationList() {
  const { isPrime, customDestinations, editCustomDestMode, addCustomDest } = useStreamSettings();

  const destinations = customDestinations;
  const isEditMode = editCustomDestMode !== false;
  const shouldShowAddForm = editCustomDestMode === true;
  const canAddMoreDestinations = destinations.length < 5;
  const shouldShowPrimeLabel = !isPrime && destinations.length > 0;

  return (
    <div>
      {destinations.map((dest, ind) => (
        <CustomDestination key={ind} ind={ind} destination={dest} />
      ))}
      {!isEditMode && canAddMoreDestinations && (
        <a className={css.addDestinationBtn} onClick={() => addCustomDest(shouldShowPrimeLabel)}>
          <i className={cx('fa fa-plus', css.plus)} />
          <span>{$t('Add Destination')}</span>

          {shouldShowPrimeLabel ? (
            <ButtonHighlighted
              onClick={() => addCustomDest(true)}
              filled
              text={$t('Ultra')}
              icon={<UltraIcon type="simple" />}
            />
          ) : (
            <div className={css.prime} />
          )}
        </a>
      )}
      {!canAddMoreDestinations && <p>{$t('Maximum custom destinations has been added')}</p>}
      {shouldShowAddForm && (
        <div className="section">
          <CustomDestForm />
        </div>
      )}
    </div>
  );
}

/**
 * Renders a single custom destination
 */
function CustomDestination(p: { destination: ICustomStreamDestination; ind: number }) {
  const { editCustomDestMode, removeCustomDest, editCustomDest } = useStreamSettings();
  const isEditMode = editCustomDestMode === p.ind;
  return (
    <div className="section">
      <div className="flex">
        <div className="margin-right--20" style={{ width: '50px' }}>
          <i className={cx(css.destinationLogo, 'fa fa-globe')} />
        </div>
        <div className={css.destinationName}>
          <span>{p.destination.name}</span> <br />
          {p.destination.url}
          <br />
        </div>

        <div style={{ marginLeft: 'auto' }}>
          {!isEditMode && (
            <div>
              <i
                className={cx('fa fa-trash', css.actionIcon)}
                onClick={() => removeCustomDest(p.ind)}
              />
              <i
                className={cx('fa fa-pen', css.actionIcon)}
                onClick={() => editCustomDest(p.ind)}
              />
            </div>
          )}
        </div>
      </div>
      {isEditMode && <CustomDestForm />}
    </div>
  );
}

/**
 * Renders an ADD/EDIT form for the custom destination
 */
function CustomDestForm() {
  const { saveCustomDest, stopEditing, formValues, updateCustomDestForm } = useStreamSettings();

  const urlValidator = {
    message: $t(
      'Please connect platforms directly from Streamlabs Desktop instead of adding Streamlabs Multistream as a custom destination',
    ),
    pattern: /^(?!.*streamlabs\.com).*/,
  };

  const meta = {
    name: metadata.text({ label: $t('Name'), required: true }),
    url: metadata.text({
      label: 'URL',
      rules: [urlValidator, { required: true }],
    }),
    streamKey: metadata.text({ label: $t('Stream Key'), isPassword: true }),
  };

  function editField(key: string) {
    return (value: TInputValue) => {
      console.log(key, value, /^(?!.*streamlabs\.com).*/.test(value as string));
      updateCustomDestForm({ [key]: value });
    };
  }

  return (
    <>
      <FormFactory
        metadata={meta}
        values={formValues}
        name="customDestForm"
        onChange={editField}
        onSubmit={saveCustomDest}
        onCancel={stopEditing}
      />
    </>
  );
}
