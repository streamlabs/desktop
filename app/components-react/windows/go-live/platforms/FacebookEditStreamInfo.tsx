import css from './FacebookEditStreamInfo.m.less';
import { CommonPlatformFields } from '../CommonPlatformFields';
import React from 'react';
import { inject, injectFormBinding, injectState, useModule } from 'slap';
import Form from '../../../shared/inputs/Form';
import { DismissablesService, EDismissable } from 'services/dismissables';
import { StreamingService } from 'services/streaming';
import { UserService } from 'services/user';
import { NavigationService } from 'services/navigation';
import { ListInput } from '../../../shared/inputs';
import GameSelector from '../GameSelector';
import {
  FacebookService,
  IFacebookLiveVideoExtended,
  IFacebookStartStreamOptions,
  TDestinationType,
  TFacebookStreamPrivacy,
} from 'services/platforms/facebook';
import moment from 'moment';
import Translate from '../../../shared/Translate';
import { IListOption } from '../../../shared/inputs/ListInput';
import MessageLayout from '../MessageLayout';
import PlatformSettingsLayout, { IPlatformComponentParams } from './PlatformSettingsLayout';
import { assertIsDefined } from '../../../../util/properties-type-guards';
import * as remote from '@electron/remote';
import { $t } from 'services/i18n';
import { Services } from '../../../service-provider';

class FacebookEditStreamInfoModule {
  fbService = inject(FacebookService);
  dismissables = inject(DismissablesService);
  streamingService = inject(StreamingService);
  state = injectState({
    pictures: {} as Record<string, string>,
    scheduledVideos: [] as IFacebookLiveVideoExtended[],
    scheduledVideosLoaded: false,
  });

  fbState = this.fbService.state;
  canStreamToTimeline = this.fbState.grantedPermissions.includes('publish_video');
  pages = this.fbState.facebookPages;
  groups = this.fbState.facebookGroups;
  isPrimary = this.streamingService.views.isPrimaryPlatform('facebook');
  isScheduleMode = false;
  props: IPlatformComponentParams<'facebook'>;

  get settings() {
    return this.props.value;
  }

  setProps(props: IPlatformComponentParams<'facebook'>) {
    this.props = props;
    if (!this.state.scheduledVideosLoaded) this.loadScheduledBroadcasts();
    if (this.settings.pageId) this.loadPicture(this.settings.pageId);
    if (this.settings.groupId) this.loadPicture(this.settings.groupId);
  }

  updateSettings(patch: Partial<IFacebookStartStreamOptions>) {
    this.props.onChange({ ...this.settings, ...patch });
  }

  setPrivacy(privacy: TFacebookStreamPrivacy) {
    this.updateSettings({ privacy: { value: privacy } });
  }

  bind = injectFormBinding(
    () => this.settings,
    newFbSettings => this.updateSettings(newFbSettings),
  );

  get layoutMode() {
    return this.props.layoutMode;
  }

  get layout() {
    return this.props.layout;
  }

  get isUpdateMode() {
    return this.props.isUpdateMode;
  }

  get shouldShowGamingWarning() {
    return this.pages.length && this.settings.game;
  }

  get shouldShowPermissionWarn() {
    /*
     * With new Facebook requirements (60 day old account, 100 followers) and error handling
     * while going live, we're removing the notification resulting from this boolean as it's confusing users.
     */
    return false;
  }

  get shouldShowDestinationType() {
    return !this.settings.liveVideoId;
  }

  get shouldShowGroups() {
    return (
      this.settings.destinationType === 'group' && !this.isUpdateMode && !this.settings.liveVideoId
    );
  }

  get shouldShowPages() {
    return (
      this.settings.destinationType === 'page' && !this.isUpdateMode && !this.settings.liveVideoId
    );
  }

  get shouldShowEvents() {
    return !this.isUpdateMode && !this.props.isScheduleMode;
  }

  get shouldShowGame() {
    // this is currently broken in the fb api
    return false;
    // return !this.isUpdateMode && !this.props.isScheduleMode;
  }

  get shouldShowPrivacy() {
    return this.settings.destinationType === 'me';
  }

  get shouldShowPrivacyWarn() {
    const fbSettings = this.settings;
    return !!(
      (!fbSettings.liveVideoId && fbSettings.privacy?.value !== 'SELF') ||
      (fbSettings.liveVideoId && fbSettings.privacy?.value)
    );
  }

  getDestinationOptions(): IListOption<TDestinationType>[] {
    // not sure if the best idea, but we decided to always show "Timeline" option
    const options: IListOption<TDestinationType>[] = [
      {
        value: 'me' as TDestinationType,
        label: $t('Share to Your Timeline'),
        image: this.fbState.userAvatar,
      },
      {
        value: 'page' as TDestinationType,
        label: $t('Share to a Page You Manage'),
        image: 'https://slobs-cdn.streamlabs.com/media/fb-page.png',
      },
    ];
    return options;
  }

  getPrivacyOptions(): IListOption<TFacebookStreamPrivacy>[] {
    const options: any = [
      {
        value: 'EVERYONE',
        label: $t('Public'),
        image: 'https://slobs-cdn.streamlabs.com/media/fb_privacy_public.png',
      },
      {
        value: 'ALL_FRIENDS',
        label: $t('Friends'),
        image: 'https://slobs-cdn.streamlabs.com/media/fb_privacy_friends.png',
      },
      {
        value: 'SELF',
        label: $t('Only Me'),
        image: 'https://slobs-cdn.streamlabs.com/media/fb_privacy_noone.png',
      },
    ];

    // we cant read the privacy property of already created video
    if (this.settings.liveVideoId || this.isUpdateMode) {
      options.unshift({ value: '', label: $t('Do not change privacy settings') });
    }
    return options;
  }

  async onEventChange(liveVideoId: string) {
    if (!liveVideoId) {
      // reset destination settings if event has been unselected
      const { groupId, pageId } = this.fbState.settings;
      this.updateSettings({
        liveVideoId,
        pageId,
        groupId,
      });
      return;
    }

    const liveVideo = this.state.scheduledVideos.find(vid => vid.id === liveVideoId);
    assertIsDefined(liveVideo);
    const newSettings = await this.fbService.actions.return.fetchStartStreamOptionsForVideo(
      liveVideoId,
      liveVideo.destinationType,
      liveVideo.destinationId,
    );
    this.updateSettings(newSettings);
  }

  private async loadScheduledBroadcasts() {
    let destinationId = this.fbService.views.getDestinationId(this.settings);
    if (!destinationId) return;
    const fbSettings = this.settings;
    const fbService = this.fbService;

    // by some unknown reason FB returns scheduled events for groups
    // only if you request these events from the user's personal page
    const destinationType =
      fbSettings.destinationType === 'group' ? 'me' : fbSettings.destinationType;
    if (destinationType === 'me') destinationId = 'me';

    const scheduledVideos = await fbService.actions.return.fetchAllVideos(true);
    const selectedVideoId = fbSettings.liveVideoId;
    const shouldFetchSelectedVideo =
      selectedVideoId && !scheduledVideos.find(v => v.id === selectedVideoId);

    if (shouldFetchSelectedVideo) {
      assertIsDefined(selectedVideoId);
      const selectedVideo = await fbService.actions.return.fetchVideo(
        selectedVideoId,
        destinationType,
        destinationId,
      );
      scheduledVideos.push(selectedVideo);
    }

    this.state.update({
      scheduledVideos,
      scheduledVideosLoaded: true,
    });
  }

  loadPictures(groupOrPage: IFacebookStartStreamOptions['destinationType']) {
    const ids =
      groupOrPage === 'group'
        ? this.fbState.facebookGroups.map(item => item.id)
        : this.fbState.facebookPages.map(item => item.id);
    ids.forEach(id => this.loadPicture(id));
  }

  async loadPicture(objectId: string) {
    const state = this.state;
    if (state.pictures[objectId]) return state.pictures[objectId];
    const picture = await this.fbService.actions.return.fetchPicture(objectId);
    state.setPictures({ ...state.pictures, [objectId]: picture });
  }

  verifyGroup() {
    remote.shell.openExternal(`https://www.facebook.com/groups/${this.settings.groupId}/edit`);
  }
}

export default function FacebookEditStreamInfo(p: IPlatformComponentParams<'facebook'>) {
  const { shouldShowPermissionWarn, setProps } = useModule(FacebookEditStreamInfoModule, true);
  setProps(p);
  return (
    <Form name="facebook-settings">
      {shouldShowPermissionWarn && <PermissionsWarning />}

      <PlatformSettingsLayout
        layoutMode={p.layoutMode}
        commonFields={<CommonFields key="common" />}
        requiredFields={<RequiredFields key="required" />}
        optionalFields={<OptionalFields key="optional" />}
        essentialOptionalFields={<Events key="events" />}
      />
    </Form>
  );
}

function CommonFields() {
  const { settings, updateSettings, layoutMode, layout } = useFacebook();

  return (
    <CommonPlatformFields
      key="common"
      platform="facebook"
      layoutMode={layoutMode}
      value={settings}
      onChange={updateSettings}
      layout={layout}
    />
  );
}

function RequiredFields() {
  const {
    isUpdateMode,
    shouldShowDestinationType,
    bind,
    shouldShowPages,
    pages,
    groups,
    shouldShowGroups,
    pictures,
    layout,
    loadPictures,
    getDestinationOptions,
    verifyGroup,
  } = useFacebook();

  return (
    <div key="required">
      {!isUpdateMode && (
        <>
          {shouldShowDestinationType && (
            <ListInput
              label={$t('Facebook Destination')}
              {...bind.destinationType}
              hasImage
              imageSize={{ width: 35, height: 35 }}
              options={getDestinationOptions()}
              layout={layout}
              size="large"
            />
          )}
          {shouldShowPages && (
            <ListInput
              {...bind.pageId}
              required={true}
              label={$t('Facebook Page')}
              hasImage
              imageSize={{ width: 44, height: 44 }}
              onDropdownVisibleChange={shown => shown && loadPictures('page')}
              options={pages.map(page => ({
                value: page.id,
                label: `${page.name} | ${page.category}`,
                image: pictures[page.id],
              }))}
              layout={layout}
              size="large"
            />
          )}
          {shouldShowGroups && (
            <>
              <ListInput
                {...bind.groupId}
                required={true}
                label={$t('Facebook Group')}
                hasImage
                imageSize={{ width: 44, height: 44 }}
                options={groups.map(group => ({
                  value: group.id,
                  label: group.name,
                  image: pictures[group.id],
                }))}
                defaultActiveFirstOption
                onDropdownVisibleChange={() => loadPictures('group')}
                extra={
                  <p>
                    {$t('Make sure the Streamlabs app is added to your Group.')}
                    <a onClick={verifyGroup}> {$t('Click here to verify.')}</a>
                  </p>
                }
                layout={layout}
                size="large"
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

function OptionalFields() {
  const {
    shouldShowPrivacy,
    settings,
    setPrivacy,
    getPrivacyOptions,
    shouldShowPrivacyWarn,
    shouldShowGame,
    shouldShowGamingWarning,
    bind,
    fbService,
    layout,
  } = useFacebook();
  return (
    <div key="optional">
      {shouldShowPrivacy && (
        <ListInput
          label={$t('Privacy')}
          value={settings.privacy?.value}
          onChange={setPrivacy}
          hasImage={true}
          imageSize={{ width: 24, height: 24 }}
          options={getPrivacyOptions()}
          className={css.privacySelector}
          extra={
            shouldShowPrivacyWarn && (
              <Translate message={$t('FBPrivacyWarning')}>
                <a
                  slot="link"
                  onClick={() =>
                    remote.shell.openExternal(
                      'https://www.facebook.com/settings?tab=business_tools',
                    )
                  }
                />
              </Translate>
            )
          }
          layout={layout}
          size="large"
        />
      )}

      {shouldShowGame && (
        <GameSelector
          {...bind.game}
          platform="facebook"
          extra={
            shouldShowGamingWarning && (
              <Translate message={$t('facebookGamingWarning')}>
                <a slot="createPageLink" onClick={() => fbService.actions.createFBPage()} />
              </Translate>
            )
          }
        />
      )}
    </div>
  );
}

function Events() {
  const {
    bind,
    shouldShowEvents,
    onEventChange,
    scheduledVideosLoaded,
    scheduledVideos,
    layout,
  } = useFacebook();
  return (
    <div key="events">
      {shouldShowEvents && (
        <ListInput
          {...bind.liveVideoId}
          onChange={onEventChange}
          label={$t('Scheduled Video')}
          loading={!scheduledVideosLoaded}
          allowClear
          placeholder={$t('Not selected')}
          options={[
            ...scheduledVideos.map(v => ({
              label: `${v.title} ${
                v.event_params?.start_time
                  ? moment(new Date(v.event_params.start_time * 1000)).calendar()
                  : ''
              }`,
              value: v.id,
            })),
          ]}
          layout={layout}
          size="large"
        />
      )}
    </div>
  );
}

function PermissionsWarning() {
  const { isPrimary, reLogin, dismissWarning, reconnectFB } = useFacebook().extend(module => ({
    user: inject(UserService),
    navigation: inject(NavigationService),
    windows: Services.WindowsService,

    async reLogin() {
      await this.user.actions.return.reLogin();
      module.streamingService.actions.showGoLiveWindow();
    },

    dismissWarning() {
      module.dismissables.actions.dismiss(EDismissable.FacebookNeedPermissionsTip);
    },

    reconnectFB() {
      const platform = 'facebook';
      this.navigation.actions.navigate('PlatformMerge', { platform });
      this.windows.actions.closeChildWindow();
    },
  }));

  return (
    <MessageLayout message={$t('You can stream to your timeline and groups now')} type={'success'}>
      {isPrimary && (
        <div>
          <div>{$t('Please log-out and log-in again to get these new features')}</div>
          <button className="button button--facebook" onClick={reLogin}>
            {$t('Re-login now')}
          </button>
          <button className="button button--trans" onClick={dismissWarning}>
            {$t('Do not show this message again')}
          </button>
        </div>
      )}
      {!isPrimary && (
        <div>
          <div>{$t('Please reconnect Facebook to get these new features')}</div>
          <button className="button button--facebook" onClick={reconnectFB}>
            {$t('Reconnect now')}
          </button>
          <button className="button button--trans" onClick={dismissWarning}>
            {$t('Do not show this message again')}
          </button>
        </div>
      )}
    </MessageLayout>
  );
}

function useFacebook() {
  return useModule(FacebookEditStreamInfoModule);
}
