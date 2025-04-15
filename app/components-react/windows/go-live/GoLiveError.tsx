import React from 'react';
import { useVuex } from '../../hooks';
import { Services } from '../../service-provider';
import { IStreamError } from '../../../services/streaming/stream-error';
import MessageLayout from './MessageLayout';
import { assertIsDefined } from '../../../util/properties-type-guards';
import {
  EPlatform,
  getPlatformService,
  platformLabels,
  platformList,
  TPlatform,
} from '../../../services/platforms';
import { $t } from '../../../services/i18n';
import Translate from '../../shared/Translate';
import css from './GoLiveError.m.less';
import * as remote from '@electron/remote';
import { ENotificationType } from 'services/notifications';
import { useGoLiveSettings } from './useGoLiveSettings';
import cloneDeep from 'lodash/cloneDeep';

/**
 * Shows an error and troubleshooting suggestions
 */
export default function GoLiveError() {
  const {
    StreamingService,
    YoutubeService,
    UserService,
    NavigationService,
    WindowsService,
    MagicLinkService,
    NotificationsService,
  } = Services;

  // take an error from the global state
  const { error, lastNotification } = useVuex(
    () => ({
      error: StreamingService.state.info.error,
      lastNotification: NotificationsService.views.lastNotification,
    }),
    false,
  );
  const { goLive, updatePlatform } = useGoLiveSettings();

  function render() {
    if (!error) return null;
    const type = error.type || 'UNKNOWN_ERROR';

    switch (type) {
      case 'PREPOPULATE_FAILED':
        return handlePlatformRequestError(error);
      case 'PRIME_REQUIRED':
        return renderPrimeRequiredError();
      case 'TWITCH_MISSED_OAUTH_SCOPE':
        return renderTwitchMissedScopeError(error);
      case 'SETTINGS_UPDATE_FAILED':
        return renderSettingsUpdateError(error);
      case 'RESTREAM_DISABLED':
      case 'RESTREAM_SETUP_FAILED':
        return renderRestreamError(error);
      case 'DUAL_OUTPUT_RESTREAM_DISABLED':
      case 'DUAL_OUTPUT_SETUP_FAILED':
        return renderDualOutputError(error);
      case 'YOUTUBE_STREAMING_DISABLED':
        return renderYoutubeStreamingDisabled(error);
      case 'TIKTOK_OAUTH_EXPIRED':
        return renderTikTokOAuthExpiredError(error);
      case 'TIKTOK_STREAM_SCOPE_MISSING':
        return renderTikTokScopeMissingError(error);
      case 'TIKTOK_GENERATE_CREDENTIALS_FAILED':
        return renderTikTokCredentialsFailedError(error);
      case 'TIKTOK_SCOPE_OUTDATED':
        return renderTikTokScopeOutdatedError(error);
      case 'FACEBOOK_STREAMING_DISABLED':
        return renderFacebookNotEligibleForStreamingError();
      case 'KICK_SCOPE_OUTDATED':
        return renderRemergeError(error);
      case 'KICK_START_STREAM_FAILED':
        return handlePlatformRequestError(error, $t('Failed to start stream on Kick.'));
      case 'KICK_STREAM_KEY_MISSING':
        return renderKickStreamKeyMissingError(error);
      case 'MACHINE_LOCKED':
        return renderMachineLockedError(error);
      default:
        return <MessageLayout error={error} />;
    }
  }

  function navigatePlatformMerge(platform: TPlatform) {
    NavigationService.actions.navigate('PlatformMerge', { platform });
    WindowsService.actions.closeChildWindow();
  }

  function handlePlatformRequestError(error: IStreamError, message?: string) {
    // show remerge/relogin component for certain Twitch and Trovo errors
    if (
      ['twitch', 'trovo', 'tiktok'].includes(error.platform as string) &&
      error?.status &&
      [401, 500].includes(error?.status)
    ) {
      const shouldRelogin =
        error.platform === ('twitch' as TPlatform) &&
        UserService.state.auth?.primaryPlatform === 'twitch';

      return renderRemergeError(error, shouldRelogin, message);
    }

    return renderPrepopulateError(error, message);
  }

  function renderPrepopulateError(error: IStreamError, message?: string) {
    assertIsDefined(error.platform);
    const platformName = getPlatformService(error.platform).displayName;
    const actions = StreamingService.actions;
    return (
      <MessageLayout
        error={error}
        message={message ?? $t('Failed to fetch settings from %{platformName}', { platformName })}
      >
        <Translate message={$t('prepopulateStreamSettingsError')}>
          <a slot="fetchAgainLink" className={css.link} onClick={() => actions.prepopulateInfo()} />
          <a slot="justGoLiveLink" className={css.link} onClick={() => actions.goLive()} />
        </Translate>
      </MessageLayout>
    );
  }

  function renderPrimeRequiredError() {
    return (
      <MessageLayout
        type={'error'}
        message={$t('Multistreaming to these platforms requires Ultra')}
      >
        <button
          className="button button--prime"
          onClick={() => MagicLinkService.actions.linkToPrime('slobs-multistream')}
        >
          {$t('Become a Ultra member')}
        </button>
      </MessageLayout>
    );
  }

  function renderRemergeError(error: IStreamError, relogin: boolean = false, message?: string) {
    assertIsDefined(error.platform);
    const mergeUrl = getPlatformService(error.platform).mergeUrl;
    const platform = getPlatformService(error.platform).displayName;

    const description =
      message ?? relogin
        ? $t('Failed to update %{platform} account. Please relogin to your %{platform} account.', {
            platform,
          })
        : $t(
            'Failed to update %{platform} account. Please unlink and reconnect your %{platform} account.',
            { platform },
          );

    return (
      <MessageLayout type="info" message={$t('Failed to update %{platform} account', { platform })}>
        <p>{description}</p>
        <Translate message="<unlink>Unlink here</unlink>">
          <a
            slot="unlink"
            onClick={() => {
              if (error.platform === 'tiktok') {
                remote.shell.openExternal(mergeUrl);
              } else if (UserService.state.auth?.primaryPlatform === error.platform) {
                WindowsService.actions.closeChildWindow();
                UserService.actions.showLogin();
              } else {
                navigatePlatformMerge(error.platform!);
              }
            }}
          />
        </Translate>
      </MessageLayout>
    );
  }

  function renderTwitchMissedScopeError(error: IStreamError) {
    // If primary platform, then ask to re-login
    const isPrimary = UserService.state.auth?.primaryPlatform === 'twitch';
    return renderRemergeError(error, isPrimary);
  }

  function renderSettingsUpdateError(error: IStreamError) {
    assertIsDefined(error.platform);
    const platformName = getPlatformService(error.platform).displayName;

    function tryAgain() {
      const actions = StreamingService.actions;
      const settings = StreamingService.views.info.settings;
      assertIsDefined(settings);
      if (WindowsService.state.child.componentName === 'EditStreamWindow') {
        actions.updateStreamSettings(settings);
      } else {
        actions.goLive(settings);
      }
    }

    function skipSettingsUpdateAndGoLive() {
      StreamingService.actions.finishStartStreaming();
      WindowsService.actions.closeChildWindow();
    }

    return (
      <MessageLayout
        error={error}
        message={$t('Failed to update settings for %{platformName}', { platformName })}
      >
        <Translate message={$t('updateStreamSettingsError')}>
          <a slot="tryAgainLink" className={css.link} onClick={tryAgain} />
          <a slot="justGoLiveLink" className={css.link} onClick={skipSettingsUpdateAndGoLive} />
        </Translate>
      </MessageLayout>
    );
  }

  function renderRestreamError(error: IStreamError) {
    // a little janky, but this is to prevent duplicate notifications for the same error on rerender
    if (!lastNotification || !lastNotification.message.startsWith($t('Multistream Error'))) {
      NotificationsService.actions.push({
        message: `${$t('Multistream Error')}: ${error.details}`,
        type: ENotificationType.WARNING,
        lifeTime: 5000,
      });
    }

    async function skipSettingsUpdateAndGoLive() {
      // clear error
      StreamingService.actions.resetError();

      // disable failed platforms
      Object.entries(cloneDeep(StreamingService.views.checklist)).forEach(
        ([key, value]: [string, string]) => {
          if (value === 'failed' && platformList.includes(key as EPlatform)) {
            updatePlatform(key as TPlatform, { enabled: false });

            // notify the user that the platform has been toggled off
            NotificationsService.actions.push({
              message: $t(
                '%{platform} Setup Error: Toggling off %{platform} to bypass and go live.',
                {
                  platform: platformLabels(key as TPlatform),
                },
              ),
              type: ENotificationType.WARNING,
              lifeTime: 5000,
            });
          }
        },
      );

      StreamingService.actions.resetInfo();

      await goLive();
    }

    const details =
      !error.details || error.details === ''
        ? [
            $t(
              'One of destinations might have incomplete permissions. Reconnect the destinations in settings and try again.',
            ),
          ]
        : error.details.split('\n');

    return (
      <MessageLayout
        error={error}
        hasButton={true}
        message={$t(
          'Please try again. If the issue persists, you can stream directly to a single platform instead or click the button below to bypass and go live.',
        )}
      >
        {`${$t('Issues')}:`}
        <ul>
          {details.map((detail: string, index: number) => (
            <li key={`detail-${index}`}>{detail}</li>
          ))}
        </ul>
        <button
          className="button button--warn"
          style={{ marginTop: '8px' }}
          onClick={skipSettingsUpdateAndGoLive}
        >
          {$t('Bypass and Go Live')}
        </button>
      </MessageLayout>
    );
  }

  function renderDualOutputError(error: IStreamError) {
    return (
      <MessageLayout error={error}>
        {$t(
          'Please try again. If the issue persists, you can stream in single output mode instead.',
        )}
      </MessageLayout>
    );
  }

  function renderYoutubeStreamingDisabled(error: IStreamError) {
    return (
      <MessageLayout message={error.message}>
        {$t(
          'Please enable your account for live streaming, and wait 24 hours before attempting to stream.',
        )}
        <br />
        <button
          className="button button--warn"
          style={{ marginTop: '8px' }}
          onClick={() => YoutubeService.actions.openYoutubeEnable()}
        >
          {$t('Enable Live Streaming')}
        </button>
      </MessageLayout>
    );
  }

  function renderTikTokOAuthExpiredError(error: IStreamError) {
    // If error authenticating with TikTok, prompt re-login
    assertIsDefined(error.platform);

    return (
      <MessageLayout error={error} hasButton={true}>
        <Translate message={$t('tiktokReAuthError')}>
          <button
            slot="connectButton"
            className="button button--warn"
            onClick={() => navigatePlatformMerge('tiktok')}
          />
        </Translate>
      </MessageLayout>
    );
  }

  function renderTikTokCredentialsFailedError(error: IStreamError) {
    return (
      <MessageLayout
        error={error}
        message={$t(
          'Failed to generate TikTok stream credentials. Confirm Live Access with TikTok.',
        )}
      ></MessageLayout>
    );
  }

  function renderTikTokScopeMissingError(error: IStreamError) {
    return (
      <MessageLayout
        error={error}
        message={$t('Your TikTok account is not enabled for live streaming.')}
      ></MessageLayout>
    );
  }

  function renderTikTokScopeOutdatedError(error: IStreamError) {
    return renderRemergeError(error);
  }

  function renderMachineLockedError(error: IStreamError) {
    return (
      <MessageLayout error={error}>
        {$t('You could try locking and unlocking your computer to fix this error.')}
      </MessageLayout>
    );
  }

  function renderFacebookNotEligibleForStreamingError() {
    return (
      <MessageLayout>
        {$t(
          "You're not eligible to Go Live, your profile needs to be at least 60 days old and your page needs to have at least 100 followers. Click the notification to learn more.",
        )}
      </MessageLayout>
    );
  }

  function renderKickStreamKeyMissingError(error: IStreamError) {
    function openKickSettings() {
      remote.shell.openExternal('https://kick.com/settings/stream');
    }
    return (
      <MessageLayout error={error} type="info" message={error.message}>
        <div>
          {$t(
            'Permissions to generate stream key for Kick are missing. In order to go live on Kick, you must first generate a stream key on Kick to be available for Streamlabs Desktop. Please follow these steps:',
          )}
          <br />
          <ol>
            <li>{$t('Login to Kick')}</li>
            <li>
              <Translate
                message={$t('Go to: <link></link>')}
                renderSlots={{
                  link: () => (
                    <a style={{ textDecoration: 'underline' }} onClick={openKickSettings}>
                      {'https://kick.com/settings/stream'}
                    </a>
                  ),
                }}
              ></Translate>
            </li>
            {/* prettier-ignore */}
            <li>{$t('Click on the \"eye\" icon to see your stream key')}</li>
            <li>{$t('Put in 2FA')}</li>
          </ol>
          {$t(
            'After 2FA, the stream key has been generated and will be available for Streamlabs Desktop for that channel. You should now be able to go live on Kick.',
          )}
        </div>
      </MessageLayout>
    );
  }

  return render();
}
