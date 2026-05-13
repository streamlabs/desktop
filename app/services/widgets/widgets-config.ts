import type { VisionService } from 'app-services';
import { ServicesManager } from 'services-manager';
import { AnchorPoint } from '../../util/ScalableRectangle';
import { TAlertType } from './alerts-config';
import { WidgetType } from './widgets-data';

export type TWidgetType =
  | WidgetType.AlertBox
  | WidgetType.ViewerCount
  | WidgetType.GameWidget
  | WidgetType.EmoteWall
  | WidgetType.DonationTicker
  | WidgetType.CustomWidget
  | WidgetType.ChatBox
  | WidgetType.SponsorBanner
  | WidgetType.DonationGoal
  | WidgetType.FollowerGoal
  | WidgetType.SubscriberGoal
  | WidgetType.SubGoal
  | WidgetType.BitGoal
  | WidgetType.StarsGoal
  | WidgetType.SupporterGoal
  | WidgetType.SuperchatGoal
  | WidgetType.CharityGoal
  | WidgetType.EventList
  | WidgetType.GamePulseWidget;

export interface IWidgetConfig {
  type: TWidgetType;

  /** Wether this widget uses the new widget API at `/api/v5/widgets/desktop/...` **/
  useNewWidgetAPI?: boolean;

  // Default transform for the widget
  defaultTransform: {
    width: number;
    height: number;

    // These are relative, so they will adjust to the
    // canvas resolution.  Valid values are between 0 and 1.
    x: number;
    y: number;

    // An anchor (origin) point can be specified for the x&y positions
    anchor: AnchorPoint;
  };

  url: string;
  dataFetchUrl: string;
  settingsSaveUrl: string;
  previewUrl: string;
  webSettingsUrl: string;
  // used specifically for goal widgets
  goalUrl?: string;
  goalCreateEvent?: string;
  goalResetEvent?: string;

  settingsUpdateEvent: string;
  testers?: TAlertType[];
  customCodeAllowed?: boolean;
  customFieldsAllowed?: boolean;

  // the settings window size
  // the default size is 600x800
  settingsWindowSize?: {
    width: number;
    height: number;
  };

  postInstall?(): void;
}

export function getWidgetsConfig(
  host: string,
  token: string,
  widgetsWithNewAPI: WidgetType[] = [],
): Record<TWidgetType, IWidgetConfig> {
  return {
    [WidgetType.AlertBox]: {
      type: WidgetType.AlertBox,

      defaultTransform: {
        width: 800,
        height: 600,
        x: 0.5,
        y: 0,
        anchor: AnchorPoint.North,
      },

      settingsWindowSize: {
        width: 850,
        height: 940,
      },

      url: `https://${host}/alert-box/v3/${token}`,
      previewUrl: `https://${host}/alert-box/v3/${token}`,
      webSettingsUrl: `https://${host}/dashboard#/alertbox`,
      dataFetchUrl: `https://${host}/api/v5/slobs/widget/alertbox?include_linked_integrations_only=true&primary_only=false`,
      settingsSaveUrl: `https://${host}/api/v5/slobs/widget/alertbox`,
      settingsUpdateEvent: 'filteredAlertBoxSettingsUpdate',
      customCodeAllowed: true,
      customFieldsAllowed: false,
    },

    [WidgetType.ViewerCount]: {
      type: WidgetType.ViewerCount,

      defaultTransform: {
        width: 600,
        height: 200,
        x: 0,
        y: 1,
        anchor: AnchorPoint.SouthWest,
      },

      settingsWindowSize: {
        width: 600,
        height: 900,
      },

      url: `https://${host}/widgets/viewer-count?token=${token}`,
      previewUrl: `https://${host}/widgets/viewer-count?token=${token}&simulate=1`,
      webSettingsUrl: `https://${host}/dashboard#/widgets/viewercount`,
      dataFetchUrl: `https://${host}/api/v5/slobs/widget/viewercount`,
      settingsSaveUrl: `https://${host}/api/v5/slobs/widget/viewercount`,
      settingsUpdateEvent: 'viewerCountSettingsUpdate',
      customCodeAllowed: true,
      customFieldsAllowed: true,
    },

    [WidgetType.GameWidget]: {
      type: WidgetType.GameWidget,

      defaultTransform: {
        width: 400,
        height: 750,
        x: 0.5,
        y: 0,
        anchor: AnchorPoint.North,
      },

      settingsWindowSize: {
        width: 850,
        height: 700,
      },

      url: `https://${host}/widgets/game-widget?token=${token}`,
      previewUrl: `https://${host}/widgets/game-widget?token=${token}&simulate=1`,
      webSettingsUrl: `https://${host}/dashboard#/widgets/game-widget`,
      dataFetchUrl: `https://${host}/api/v5/slobs/widget/game-widget`,
      settingsSaveUrl: `https://${host}/api/v5/slobs/widget/game-widget`,
      settingsUpdateEvent: 'gameWidgetSettingsUpdate',
      customCodeAllowed: false,
      customFieldsAllowed: false,
    },

    [WidgetType.EmoteWall]: {
      type: WidgetType.EmoteWall,

      defaultTransform: {
        width: 1280,
        height: 720,
        x: 0,
        y: 0,
        anchor: AnchorPoint.NorthWest,
      },

      settingsWindowSize: {
        width: 600,
        height: 900,
      },

      url: `https://${host}/widgets/emote-wall?token=${token}`,
      previewUrl: `https://${host}/widgets/emote-wall?token=${token}&simulate=1`,
      webSettingsUrl: `https://${host}/dashboard#/widgets/emote-wall`,
      dataFetchUrl: `https://${host}/api/v5/slobs/widget/emote-wall`,
      settingsSaveUrl: `https://${host}/api/v5/slobs/widget/emote-wall`,
      settingsUpdateEvent: 'emoteWallSettingsUpdate',
      customCodeAllowed: false,
      customFieldsAllowed: false,
    },

    [WidgetType.DonationGoal]: {
      type: WidgetType.DonationGoal,

      defaultTransform: {
        width: 600,
        height: 200,
        x: 0,
        y: 1,
        anchor: AnchorPoint.SouthWest,
      },

      settingsWindowSize: {
        width: 700,
        height: 800,
      },

      url: `https://${host}/widgets/donation-goal?token=${token}`,
      previewUrl: `https://${host}/widgets/donation-goal?token=${token}`,
      webSettingsUrl: `https://${host}/dashboard#/widgets/tip-goal`,
      dataFetchUrl: `https://${host}/api/v5/slobs/widget/donationgoal/settings/new`,
      settingsSaveUrl: `https://${host}/api/v5/slobs/widget/donationgoal/settings/new`,
      goalUrl: `https://${host}/api/v5/slobs/widget/donationgoal/new`,
      settingsUpdateEvent: 'donationGoalSettingsUpdate',
      goalCreateEvent: 'donationGoalStart',
      goalResetEvent: 'donationGoalEnd',
      customCodeAllowed: true,
      customFieldsAllowed: true,
    },

    [WidgetType.FollowerGoal]: {
      type: WidgetType.FollowerGoal,

      defaultTransform: {
        width: 600,
        height: 200,
        x: 0,
        y: 1,
        anchor: AnchorPoint.SouthWest,
      },

      settingsWindowSize: {
        width: 700,
        height: 800,
      },

      url: `https://${host}/widgets/follower-goal?token=${token}`,
      previewUrl: `https://${host}/widgets/follower-goal?token=${token}`,
      webSettingsUrl: `https://${host}/dashboard#/widgets/followergoal`,
      dataFetchUrl: `https://${host}/api/v5/slobs/widget/followergoal/settings`,
      settingsSaveUrl: `https://${host}/api/v5/slobs/widget/followergoal/settings`,
      goalUrl: `https://${host}/api/v5/slobs/widget/followergoal`,
      settingsUpdateEvent: 'followerGoalSettingsUpdate',
      goalCreateEvent: 'followerGoalStart',
      goalResetEvent: 'followerGoalEnd',
      customCodeAllowed: true,
      customFieldsAllowed: true,
    },

    [WidgetType.SubscriberGoal]: {
      type: WidgetType.SubscriberGoal,

      defaultTransform: {
        width: 600,
        height: 200,
        x: 0,
        y: 1,
        anchor: AnchorPoint.SouthWest,
      },

      settingsWindowSize: {
        width: 700,
        height: 800,
      },

      // This is for YT Subscribers which is a type of Follower
      url: `https://${host}/widgets/follower-goal?token=${token}`,
      previewUrl: `https://${host}/widgets/follower-goal?token=${token}`,
      webSettingsUrl: `https://${host}/dashboard#/widgets/followergoal`,
      dataFetchUrl: `https://${host}/api/v5/slobs/widget/followergoal/settings`,
      settingsSaveUrl: `https://${host}/api/v5/slobs/widget/followergoal/settings`,
      goalUrl: `https://${host}/api/v5/slobs/widget/followergoal`,
      settingsUpdateEvent: 'followerGoalSettingsUpdate',
      goalCreateEvent: 'followerGoalStart',
      goalResetEvent: 'followerGoalEnd',
      customCodeAllowed: true,
      customFieldsAllowed: true,
    },

    [WidgetType.SubGoal]: {
      type: WidgetType.SubGoal,

      defaultTransform: {
        width: 600,
        height: 200,
        x: 0,
        y: 1,
        anchor: AnchorPoint.SouthWest,
      },

      settingsWindowSize: {
        width: 700,
        height: 800,
      },

      url: `https://${host}/widgets/sub-goal?token=${token}`,
      dataFetchUrl: `https://${host}/api/v5/slobs/widget/subgoal/settings`,
      previewUrl: `https://${host}/widgets/sub-goal?token=${token}`,
      webSettingsUrl: `https://${host}/dashboard#/widgets/subgoal`,
      settingsSaveUrl: `https://${host}/api/v5/slobs/widget/subgoal/settings`,
      goalUrl: `https://${host}/api/v5/slobs/widget/subgoal`,
      settingsUpdateEvent: 'subGoalSettingsUpdate',
      goalCreateEvent: 'subGoalStart',
      goalResetEvent: 'subGoalEnd',
      customCodeAllowed: true,
      customFieldsAllowed: true,
    },

    [WidgetType.BitGoal]: {
      type: WidgetType.BitGoal,

      defaultTransform: {
        width: 600,
        height: 200,
        x: 0,
        y: 1,
        anchor: AnchorPoint.SouthWest,
      },

      settingsWindowSize: {
        width: 700,
        height: 800,
      },

      url: `https://${host}/widgets/bit-goal?token=${token}`,
      dataFetchUrl: `https://${host}/api/v5/slobs/widget/bitgoal/settings`,
      previewUrl: `https://${host}/widgets/bit-goal?token=${token}`,
      webSettingsUrl: `https://${host}/dashboard#/widgets/bitgoal`,
      settingsSaveUrl: `https://${host}/api/v5/slobs/widget/bitgoal/settings`,
      goalUrl: `https://${host}/api/v5/slobs/widget/bitgoal`,
      settingsUpdateEvent: 'bitGoalSettingsUpdate',
      goalCreateEvent: 'bitGoalStart',
      goalResetEvent: 'bitGoalEnd',
      customCodeAllowed: true,
      customFieldsAllowed: true,
    },

    [WidgetType.StarsGoal]: {
      type: WidgetType.StarsGoal,

      defaultTransform: {
        width: 600,
        height: 200,
        x: 0,
        y: 1,
        anchor: AnchorPoint.SouthWest,
      },

      settingsWindowSize: {
        width: 700,
        height: 800,
      },

      url: `https://${host}/widgets/stars-goal?token=${token}`,
      previewUrl: `https://${host}/widgets/stars-goal?token=${token}`,
      webSettingsUrl: `https://${host}/dashboard#/widgets/starsgoal`,
      dataFetchUrl: `https://${host}/api/v5/slobs/widget/starsgoal/settings`,
      settingsSaveUrl: `https://${host}/api/v5/slobs/widget/starsgoal/settings`,
      goalUrl: `https://${host}/api/v5/slobs/widget/starsgoal`,
      settingsUpdateEvent: 'starsGoalSettingsUpdate',
      goalCreateEvent: 'starsGoalStart',
      goalResetEvent: 'starsGoalEnd',
      customCodeAllowed: true,
      customFieldsAllowed: true,
    },

    [WidgetType.SupporterGoal]: {
      type: WidgetType.SupporterGoal,

      defaultTransform: {
        width: 600,
        height: 200,
        x: 0,
        y: 1,
        anchor: AnchorPoint.SouthWest,
      },

      settingsWindowSize: {
        width: 700,
        height: 800,
      },

      url: `https://${host}/widgets/supporter-goal?token=${token}`,
      previewUrl: `https://${host}/widgets/supporter-goal?token=${token}`,
      webSettingsUrl: `https://${host}/dashboard#/widgets/supportergoal`,
      dataFetchUrl: `https://${host}/api/v5/slobs/widget/supportergoal/settings`,
      settingsSaveUrl: `https://${host}/api/v5/slobs/widget/supportergoal/settings`,
      goalUrl: `https://${host}/api/v5/slobs/widget/supportergoal`,
      settingsUpdateEvent: 'supporterGoalSettingsUpdate',
      goalCreateEvent: 'supporterGoalStart',
      goalResetEvent: 'supporterGoalEnd',
      customCodeAllowed: true,
      customFieldsAllowed: true,
    },

    [WidgetType.SuperchatGoal]: {
      type: WidgetType.SuperchatGoal,

      defaultTransform: {
        width: 600,
        height: 200,
        x: 0,
        y: 1,
        anchor: AnchorPoint.SouthWest,
      },

      settingsWindowSize: {
        width: 700,
        height: 800,
      },

      url: `https://${host}/widgets/super-chat-goal?token=${token}`,
      previewUrl: `https://${host}/widgets/super-chat-goal?token=${token}`,
      webSettingsUrl: `https://${host}/dashboard#/widgets/super-chat-goal`,
      dataFetchUrl: `https://${host}/api/v5/slobs/widget/superchatgoal/settings`,
      settingsSaveUrl: `https://${host}/api/v5/slobs/widget/superchatgoal/settings`,
      goalUrl: `https://${host}/api/v5/slobs/widget/superchatgoal`,
      settingsUpdateEvent: 'superChatGoalSettingsUpdate',
      goalCreateEvent: 'superChatGoalStart',
      goalResetEvent: 'superChatGoalEnd',
      customCodeAllowed: true,
      customFieldsAllowed: true,
    },

    [WidgetType.CharityGoal]: {
      type: WidgetType.CharityGoal,

      defaultTransform: {
        width: 600,
        height: 200,
        x: 0,
        y: 1,
        anchor: AnchorPoint.SouthWest,
      },

      settingsWindowSize: {
        width: 700,
        height: 800,
      },

      url: `https://${host}/widgets/streamlabs-charity-donation-goal?token=${token}`,
      dataFetchUrl: `https://${host}/api/v5/slobs/widget/streamlabscharitydonationgoal/settings`,
      previewUrl: `https://${host}/widgets/streamlabs-charity-donation-goal?token=${token}`,
      webSettingsUrl: `https://${host}/dashboard#/widgets/streamlabs-charity-donation-goal`,
      settingsSaveUrl: `https://${host}/api/v5/slobs/widget/streamlabscharitydonationgoal/settings`,
      goalUrl: `https://${host}/api/v5/slobs/widget/streamlabscharitydonationgoal`,
      settingsUpdateEvent: 'streamlabsCharityDonationGoalSettingsUpdate',
      customCodeAllowed: true,
      customFieldsAllowed: true,
    },

    [WidgetType.ChatBox]: {
      type: WidgetType.ChatBox,

      defaultTransform: {
        width: 600,
        height: 600,
        x: 0,
        y: 0.5,
        anchor: AnchorPoint.West,
      },

      settingsWindowSize: {
        width: 850,
        height: 700,
      },

      settingsUpdateEvent: 'chatBoxSettingsUpdate',
      customCodeAllowed: true,
      customFieldsAllowed: true,
      url: `https://${host}/widgets/chat-box/v1/${token}`,
      previewUrl: `https://${host}/widgets/chat-box/v1/${token}?simulate=1`,
      webSettingsUrl: `https://${host}/dashboard#/widgets/chat-box`,

      ...(widgetsWithNewAPI.includes(WidgetType.ChatBox)
        ? {
            // TODO: extra boolean tracking, move to method
            useNewWidgetAPI: true,
            dataFetchUrl: `https://${host}/api/v5/widgets/desktop/chat-box`,
            settingsSaveUrl: `https://${host}/api/v5/widgets/desktop/chat-box`,
          }
        : {
            dataFetchUrl: `https://${host}/api/v5/slobs/widget/chatbox`,
            settingsSaveUrl: `https://${host}/api/v5/slobs/widget/chatbox`,
          }),
    },

    // ChatHighlight: {
    //
    // },

    // Credits: {
    //
    // },

    [WidgetType.DonationTicker]: {
      type: WidgetType.DonationTicker,

      defaultTransform: {
        width: 600,
        height: 200,
        x: 1,
        y: 1,
        anchor: AnchorPoint.SouthEast,
      },

      settingsWindowSize: {
        width: 600,
        height: 900,
      },

      url: `https://${host}/widgets/donation-ticker?token=${token}`,
      previewUrl: `https://${host}/widgets/donation-ticker?token=${token}&simulate=1`,
      webSettingsUrl: `https://${host}/dashboard#/widgets/tipticker`,
      dataFetchUrl: `https://${host}/api/v5/slobs/widget/ticker`,
      settingsSaveUrl: `https://${host}/api/v5/slobs/widget/ticker`,
      settingsUpdateEvent: 'donationTickerSettingsUpdate',
      customCodeAllowed: true,
      customFieldsAllowed: true,
    },

    [WidgetType.EventList]: {
      type: WidgetType.EventList,

      defaultTransform: {
        width: 600,
        height: 600,
        x: 1,
        y: 0,
        anchor: AnchorPoint.NorthEast,
      },

      settingsWindowSize: {
        width: 850,
        height: 700,
      },

      url: `https://${host}/widgets/event-list/v1/${token}`,
      previewUrl: `https://${host}/widgets/event-list/v1/${token}?simulate=1`,
      webSettingsUrl: `https://${host}/dashboard#/widgets/eventlist`,
      dataFetchUrl: `https://${host}/api/v5/slobs/widget/eventlist`,
      settingsSaveUrl: `https://${host}/api/v5/slobs/widget/eventlist`,
      settingsUpdateEvent: 'eventListSettingsUpdate',
      customCodeAllowed: true,
      customFieldsAllowed: true,
      testers: ['follow', 'sub', 'donation', 'bits'],
    },

    // MediaShare: {
    //
    //  },

    // Poll: {
    //
    //  },

    // SpinWheel: {
    //
    // },

    [WidgetType.SponsorBanner]: {
      type: WidgetType.SponsorBanner,

      defaultTransform: {
        width: 600,
        height: 200,

        x: 0,
        y: 1,

        anchor: AnchorPoint.SouthWest,
      },

      settingsWindowSize: {
        width: 850,
        height: 700,
      },

      url: `https://${host}/widgets/sponsor-banner?token=${token}`,
      previewUrl: `https://${host}/widgets/sponsor-banner?token=${token}`,
      webSettingsUrl: `https://${host}/dashboard#/widgets/sponsorbanner`,
      dataFetchUrl: `https://${host}/api/v5/slobs/widget/sponsorbanner`,
      settingsSaveUrl: `https://${host}/api/v5/slobs/widget/sponsorbanner`,
      settingsUpdateEvent: 'sponsorBannerSettingsUpdate',
      customCodeAllowed: true,
      customFieldsAllowed: true,
    },

    // StreamBoss: {
    //
    //  },

    // TipJar: {
    //
    // },

    [WidgetType.CustomWidget]: {
      type: WidgetType.CustomWidget,

      defaultTransform: {
        width: 400,
        height: 750,
        x: 0.5,
        y: 0,
        anchor: AnchorPoint.North,
      },

      settingsWindowSize: {
        width: 850,
        height: 700,
      },

      url: `https://${host}/widgets/custom-widget?token=${token}`,
      previewUrl: `https://${host}/widgets/custom-widget?token=${token}`,
      webSettingsUrl: `https://${host}/dashboard#/widgets/customwidget`,
      dataFetchUrl: `https://${host}/api/v5/slobs/widget/customwidget`,
      settingsSaveUrl: `https://${host}/api/v5/slobs/widget/customwidget`,
      settingsUpdateEvent: 'customWidgetSettingsUpdate',
      customCodeAllowed: true,
      customFieldsAllowed: true,
    },

    [WidgetType.GamePulseWidget]: {
      type: WidgetType.GamePulseWidget,

      defaultTransform: {
        width: 1920,
        height: 1080,
        x: 0,
        y: 0,
        anchor: AnchorPoint.NorthWest,
      },

      settingsWindowSize: {
        width: 800,
        height: 800,
      },

      useNewWidgetAPI: true,
      url: `https://${host}/api/v5/widgets/desktop/game-pulse`,
      previewUrl: `https://${host}/widgets/preview/game-pulse/${token}?simulate=1`,
      webSettingsUrl: `https://${host}/dashboard#/widgets/game-pulse`,
      dataFetchUrl: `https://${host}/api/v5/widgets/desktop/game-pulse`,
      settingsSaveUrl: `https://${host}/api/v5/widgets/desktop/game-pulse`,
      settingsUpdateEvent: 'gamePulseSettingsUpdate',
      customCodeAllowed: false,
      customFieldsAllowed: false,

      postInstall() {
        const visionService = ServicesManager.instance.getService('VisionService')
          .instance as VisionService;
        visionService.actions.setIsEnabled(true);
      },
    },
  };
}
