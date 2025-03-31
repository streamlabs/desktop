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
  | WidgetType.ChatBox;

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
      dataFetchUrl: `https://${host}/api/v5/slobs/widget/emote-wall`,
      settingsSaveUrl: `https://${host}/api/v5/slobs/widget/emote-wall`,
      settingsUpdateEvent: 'emoteWallSettingsUpdate',
      customCodeAllowed: false,
      customFieldsAllowed: false,
    },

    // TODO:
    // BitGoal: {
    //
    // },

    // DonationGoal: {
    //
    // },

    // CharityGoal: {
    //
    // },

    // FollowerGoal: {
    //
    // },

    // StarsGoal: {
    //
    // },

    // SubGoal: {
    //
    // },

    // SubscriberGoal: {
    //
    // },

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
      dataFetchUrl: `https://${host}/api/v5/slobs/widget/ticker`,
      settingsSaveUrl: `https://${host}/api/v5/slobs/widget/ticker`,
      settingsUpdateEvent: 'donationTickerSettingsUpdate',
      customCodeAllowed: true,
      customFieldsAllowed: true,
    },

    // EventList: {
    //
    // },

    // MediaShare: {
    //
    //  },

    // Poll: {
    //
    //  },

    // SpinWheel: {
    //
    // },

    // SponsorBanner: {
    //
    // },

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
      dataFetchUrl: `https://${host}/api/v5/slobs/widget/customwidget`,
      settingsSaveUrl: `https://${host}/api/v5/slobs/widget/customwidget`,
      settingsUpdateEvent: 'customWidgetSettingsUpdate',
      customCodeAllowed: true,
      customFieldsAllowed: true,
    },
  };
}
