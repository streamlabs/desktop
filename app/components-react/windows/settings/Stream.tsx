import React, { useEffect, useMemo, useState } from 'react';
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
import styles from './Stream.m.less';
import cx from 'classnames';
import { Button, message, Tooltip } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
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
import { useSubscription } from 'components-react/hooks/useSubscription';

const PlusIcon = PlusOutlined as Function;

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
  constructor() {}

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
  private get streamingService() {
    return Services.StreamingService;
  }
  private get magicLinkService() {
    return Services.MagicLinkService;
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

  get streamingView() {
    return this.streamingService.views;
  }

  get customDestinations() {
    return this.streamingView.savedSettings.customDestinations;
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
  const { StreamingService, StreamSettingsService, UserService, DualOutputService } = Services;

  const { canEditSettings, protectedModeEnabled, needToShowWarning, platforms, isPrime } = useVuex(
    () => ({
      canEditSettings: Services.StreamingService.state.streamingStatus === EStreamingState.Offline,
      protectedModeEnabled: Services.StreamSettingsService.protectedModeEnabled,
      needToShowWarning: UserService.isLoggedIn && !StreamSettingsService.protectedModeEnabled,
      platforms: StreamingService.views.allPlatforms,
      isPrime: UserService.views.isPrime,
    }),
  );

  // Show a message when the user has unlinked/linked their account on web
  useSubscription(
    UserService.refreshedLinkedAccounts,
    (res: { success: boolean; message: string }) => {
      const doShowMessage = () => {
        message.config({
          duration: 6,
          maxCount: 1,
        });

        if (res.success) {
          message.success(res.message);
        } else {
          message.error(res.message);
        }
      };

      /*
       * Since the settings window pops out anyways (presumably because of
       * using `message` make sure it is at least on the right page, as opposed
       * to in an infinite loading blank window state.
       */
      doShowMessage();
    },
  );

  function disableProtectedMode() {
    StreamSettingsService.actions.setSettings({ protectedModeEnabled: false });
    if (DualOutputService.views.dualOutputMode) {
      DualOutputService.actions.setDualOutputModeIfPossible(false, true);
    }
  }

  function enableProtectedMode() {
    StreamSettingsService.actions.setSettings({
      protectedModeEnabled: true,
      key: '',
      streamType: 'rtmp_common',
    });
  }

  async function openPlatformSettings() {
    try {
      const link = await Services.MagicLinkService.getDashboardMagicLink(
        'settings/account-settings/platforms',
      );
      remote.shell.openExternal(link);
    } catch (e: unknown) {
      console.error('Error generating platform settings magic link', e);
    }
  }

  return (
    <div className={styles.section}>
      {/* account info */}
      {protectedModeEnabled && (
        <div className={styles.protectedMode}>
          <h2>{$t('Streamlabs ID')}</h2>
          <SLIDBlock />
          <div className={styles.streamHeaderWrapper}>
            <h2 style={{ flex: 1 }}>{$t('Stream Destinations')}</h2>
            <div
              className={styles.addMore}
              onClick={openPlatformSettings}
              style={{ color: 'var(--primary)', fontSize: '15px' }}
            >
              <PlusIcon style={{ paddingRight: '5px', color: 'var(--primary)' }} />
              {$t('Add More')}
            </div>
          </div>
          {!isPrime && (
            <div className={styles.ultraText}>
              <UltraIcon type="badge" style={{ marginRight: '5px' }} />
              <div onClick={() => Services.MagicLinkService.linkToPrime('slobs-stream-settings')}>
                {$t('Upgrade to Ultra to stream to multiple platforms simultaneously!')}
              </div>
            </div>
          )}
          {platforms.map(platform => (
            <Platform key={platform} platform={platform} />
          ))}

          {canEditSettings && (
            <a
              className={styles.customDest}
              onClick={disableProtectedMode}
              style={{ marginBottom: '10px' }}
            >
              {$t('Stream to custom ingest')}
            </a>
          )}
          <CustomDestinationList />
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
    <div className={cx('section flex', styles.targetCard, styles.section)}>
      <PlatformLogo className={styles.targetLogo} size="medium" platform="streamlabs" />

      <div className={styles.targetData}>
        {hasSLID && username ? (
          <b>{censorEmail(username)}</b>
        ) : (
          <Translate message={$t('slidConnectMessage')} />
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        {hasSLID ? (
          <>
            <a
              style={{ fontWeight: 400, marginRight: 10, textDecoration: 'underline' }}
              onClick={openPasswordLink}
            >
              {$t('Update Password')}
            </a>
            <a style={{ fontWeight: 400, textDecoration: 'underline' }} onClick={openTwoFactorLink}>
              {$t('Update Two-factor Auth')}
            </a>
          </>
        ) : (
          <Button type="primary" onClick={mergeSLID}>
            {$t('Setup')}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Renders a Platform placeholder
 */
function Platform(p: { platform: TPlatform }) {
  const platform = p.platform;
  const { UserService, StreamingService, InstagramService } = Services;

  const { isLoading, authInProgress, instagramSettings, canEditSettings } = useVuex(() => ({
    isLoading: UserService.state.authProcessState === EAuthProcessState.Loading,
    authInProgress: UserService.state.authProcessState === EAuthProcessState.InProgress,
    instagramSettings: InstagramService.state.settings,
    canEditSettings: StreamingService.state.streamingStatus === EStreamingState.Offline,
  }));

  const isMerged = StreamingService.views.isPlatformLinked(platform);
  const platformObj = UserService.state.auth!.platforms[platform];
  const username = platformObj?.username;
  const platformName = useMemo(() => getPlatformService(platform).displayName, []);
  const isPrimary = StreamingService.views.isPrimaryPlatform(platform);
  const shouldShowPrimaryBtn = isPrimary;
  const shouldShowConnectBtn = !isMerged && canEditSettings;
  const shouldShowUnlinkBtn = !isPrimary && isMerged && canEditSettings;

  function platformUnlink(platform: TPlatform) {
    getPlatformService(platform).unlink();
  }

  async function platformMergeInline(platform: TPlatform) {
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
        className={cx({ [styles.tiktokConnectBtn]: platform === 'tiktok' })}
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
        <div className={cx(styles.extraFieldsSection)}>
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
    <div className={cx('section', styles.section)}>
      <div className={styles.targetCard}>
        <PlatformLogo
          className={cx(styles.targetLogo, {
            [styles.youtube]: platform === 'youtube',
            [styles.twitter]: platform === 'twitter',
          })}
          size={36}
          platform={platform}
        />

        <div className={styles.targetData}>
          <span className={styles.targetType}>{platformName}</span>
          {isMerged ? (
            <span className={styles.targetName}>{usernameOrBlank}</span>
          ) : (
            <>
              <br />
              <span className={styles.targetName} style={{ opacity: '0.5' }}>
                {$t('unlinked')}
              </span>
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
  const { customDestinations, editCustomDestMode, addCustomDest } = useStreamSettings();

  const { isPrime } = useVuex(() => ({
    isPrime: Services.UserService.isPrime,
  }));

  const destinations = customDestinations;
  const isEditMode = editCustomDestMode !== false;
  const shouldShowAddForm = editCustomDestMode === true;
  const canAddMoreDestinations = destinations.length < 5;
  const shouldShowPrimeLabel = !isPrime && destinations.length > 0;

  return (
    <div className={styles.customDestinations}>
      <div className={styles.targetCardsWrapper}>
        {destinations.map((dest, ind) => (
          <CustomDestination key={ind} ind={ind} destination={dest} />
        ))}
      </div>
      {!isEditMode && canAddMoreDestinations && (
        <a className={styles.addDestinationBtn} onClick={() => addCustomDest(shouldShowPrimeLabel)}>
          <i className={cx('fa fa-plus', styles.plus)} />
          <span>{$t('Add Destination')}</span>

          {shouldShowPrimeLabel ? (
            <ButtonHighlighted
              onClick={() => addCustomDest(true)}
              filled
              text={$t('Ultra')}
              icon={<UltraIcon type="simple" />}
            />
          ) : (
            <div className={styles.ultra} />
          )}
        </a>
      )}
      {!canAddMoreDestinations && <p>{$t('Maximum custom destinations has been added')}</p>}
      {shouldShowAddForm && <CustomDestForm />}
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
    <div className={cx('section', 'flex--column', styles.section)}>
      <div className={styles.targetCard}>
        <i className={cx(styles.targetLogo, 'fa fa-globe')} />

        <div className={cx({ [styles.targetData]: isEditMode })}>
          <span className={styles.targetType}>{p.destination.name}</span> <br />
          <span className={styles.targetName}>{p.destination.url}</span>
          <br />
        </div>

        <div style={{ marginLeft: 'auto' }}>
          {!isEditMode && (
            <div>
              <i
                className={cx('fa fa-trash', styles.actionIcon)}
                onClick={() => removeCustomDest(p.ind)}
              />
              <i
                className={cx('fa fa-pen', styles.actionIcon)}
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
    <FormFactory
      metadata={meta}
      values={formValues}
      name="customDestForm"
      onChange={editField}
      onSubmit={saveCustomDest}
      onCancel={stopEditing}
    />
  );
}
