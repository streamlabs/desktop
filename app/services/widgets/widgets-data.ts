import { IWidgetTester, IWidget } from './widgets-api';
import { AnchorPoint } from 'util/ScalableRectangle';
import { $t } from 'services/i18n';
import { TAlertType } from './alerts-config';
import { TPlatform } from '../platforms';

export interface IWidgetDisplayData {
  name: string;
  description: string;
  platforms?: Set<string>;
  demoVideo: boolean;
  demoFilename: string;
  supportList: string[];
  icon: string;
  shortDesc?: string;
  link?: string;
  linkText?: string;
  group: TWidgetGroup;
}

export type TWidgetGroup = 'essential' | 'interactive' | 'goals' | 'flair' | 'charity';

// Do not alter the order of this enum, it is coupled to the user's local config
export enum WidgetType {
  AlertBox = 0,
  DonationGoal = 1,
  FollowerGoal = 2,
  SubscriberGoal = 3,
  BitGoal = 4,
  DonationTicker = 5,
  ChatBox = 6,
  EventList = 7,
  TipJar = 8,
  ViewerCount = 9,
  StreamBoss = 10,
  Credits = 11,
  SpinWheel = 12,
  SponsorBanner = 13,
  MediaShare = 14,
  SubGoal = 15,
  StarsGoal = 16,
  SupporterGoal = 17,
  CharityGoal = 18,
  Poll = 19,
  EmoteWall = 20,
  ChatHighlight = 21,
  SuperchatGoal = 22,
  GameWidget = 23,
  CustomWidget = 24,
}

// TODO: there's some duplication between this and `WidgetsService.playAlert`
export const makeWidgetTesters = (host: string): IWidgetTester[] => {
  const prefix = `https://${host}/api/v5/widgets/desktop/test`;
  const testUrl = (alertType: TAlertType) => `${prefix}/${alertType}`;

  /**
   * Return an alert type undecorated if the platform is Twitch, (e.g. sub),
   * or with a platform prefix otherwise, (e.g. trovo_follow)
   *
   * Examples:
   *
   * alertTypeWithTwitchDefault('sub', 'twitch') => sub
   * alertTypeWithTwitchDefault('follow', 'trovo') => trovo_follow
   */
  const alertTypeWithTwitchDefault = (alertType: TAlertType, platform: TPlatform): TAlertType => {
    const alert = platform === ('twitch' as TPlatform) ? alertType : `${platform}_${alertType}`;
    // TODO: there might be an elegant way to do this with `Extract` or something else, but clever code...?
    return (alert as unknown) as TAlertType;
  };

  return [
    {
      type: 'follows',
      name: 'Follow',
      url(platform) {
        return testUrl(alertTypeWithTwitchDefault('follow', platform));
      },
      platforms: ['twitch', 'facebook', 'trovo'],
    },
    {
      name: 'Subscriber',
      url: testUrl('subscriber'),
      platforms: ['youtube'],
    },
    {
      name: 'Subscription',
      url(platform) {
        return testUrl(alertTypeWithTwitchDefault('sub', platform));
      },
      platforms: ['twitch', 'trovo'],
    },
    {
      name: 'Membership',
      url: testUrl('fanfunding'),
      platforms: ['youtube'],
    },
    {
      type: 'donations',
      name: 'Tip',
      url: testUrl('donation'),
      platforms: ['twitch', 'youtube', 'facebook', 'tiktok', 'trovo'],
    },
    {
      type: 'bits',
      name: 'Bits',
      url: testUrl('bits'),
      platforms: ['twitch'],
    },
    {
      name: 'Super Chat',
      url: testUrl('fanfunding'),
      platforms: ['youtube'],
    },
    {
      name: 'Share',
      url: testUrl('facebook_share'),
      platforms: ['facebook'],
    },
    {
      name: 'Support',
      url: testUrl('facebook_support'),
      platforms: ['facebook'],
    },
    {
      name: 'Stars',
      url: testUrl('facebook_stars'),
      platforms: ['facebook'],
    },
    {
      name: 'Like',
      url: testUrl('facebook_like'),
      platforms: ['facebook'],
    },
    {
      name: 'Merch',
      url: testUrl('merch'),
      // TODO: is this only for YouTube?
      platforms: ['youtube'],
    },
    {
      name: 'Cloudbot Redeem',
      url: testUrl('loyalty_store_redemption'),
      platforms: ['youtube'],
    },
  ] as IWidgetTester[];
};

// TODO: the type of this needs to match what's used on the UI with WidgetDisplayData
export const WidgetDefinitions: { [x: number]: IWidget } = {
  [WidgetType.AlertBox]: {
    name: 'Alert Box',
    humanType: 'alert_box',
    url(host, token) {
      return `https://${host}/alert-box/v3/${token}`;
    },

    width: 800,
    height: 600,

    x: 0.5,
    y: 0,

    anchor: AnchorPoint.North,
  },

  [WidgetType.DonationGoal]: {
    name: 'Tip Goal',
    humanType: 'donation_goal',
    url(host, token) {
      return `https://${host}/widgets/donation-goal?token=${token}`;
    },

    width: 600,
    height: 200,

    x: 0,
    y: 1,

    anchor: AnchorPoint.SouthWest,
  },

  [WidgetType.FollowerGoal]: {
    name: 'Follower Goal',
    humanType: 'follower_goal',
    url(host, token) {
      return `https://${host}/widgets/follower-goal?token=${token}`;
    },

    width: 600,
    height: 200,

    x: 0,
    y: 1,

    anchor: AnchorPoint.SouthWest,
  },

  // TODO: what is this widget and why does it point to follower goal?
  [WidgetType.SubscriberGoal]: {
    name: 'Subscriber Goal',
    humanType: 'follower_goal',
    url(host, token) {
      return `https://${host}/widgets/follower-goal?token=${token}`;
    },

    width: 600,
    height: 200,

    x: 0,
    y: 1,

    anchor: AnchorPoint.SouthWest,
  },

  [WidgetType.SubGoal]: {
    name: 'Sub Goal',
    humanType: 'sub_goal',
    url(host, token) {
      return `https://${host}/widgets/sub-goal?token=${token}`;
    },

    width: 600,
    height: 200,

    x: 0,
    y: 1,

    anchor: AnchorPoint.SouthWest,
  },

  [WidgetType.BitGoal]: {
    name: 'Bit Goal',
    humanType: 'bit_goal',
    url(host, token) {
      return `https://${host}/widgets/bit-goal?token=${token}`;
    },

    width: 600,
    height: 200,

    x: 0,
    y: 1,

    anchor: AnchorPoint.SouthWest,
  },

  [WidgetType.StarsGoal]: {
    name: 'Stars Goal',
    humanType: 'stars_goal',
    url(host, token) {
      return `https://${host}/widgets/stars-goal?token=${token}`;
    },

    width: 600,
    height: 200,

    x: 0,
    y: 1,

    anchor: AnchorPoint.SouthWest,
  },

  [WidgetType.SupporterGoal]: {
    name: 'Supporter Goal',
    humanType: 'supporter_goal',
    url(host, token) {
      return `https://${host}/widgets/supporter-goal?token=${token}`;
    },

    width: 600,
    height: 200,

    x: 0,
    y: 1,

    anchor: AnchorPoint.SouthWest,
  },

  [WidgetType.SuperchatGoal]: {
    name: 'Superchat Goal',
    humanType: 'super_chat_goal',
    url(host, token) {
      return `https://${host}/widgets/super-chat-goal?token=${token}`;
    },

    width: 600,
    height: 200,

    x: 0,
    y: 1,

    anchor: AnchorPoint.SouthWest,
  },

  [WidgetType.CharityGoal]: {
    name: 'Streamlabs Charity Goal',
    humanType: 'streamlabs_charity_donation_goal',
    url(host, token) {
      return `https://${host}/widgets/streamlabs-charity-donation-goal?token=${token}`;
    },

    width: 600,
    height: 200,

    x: 0,
    y: 1,

    anchor: AnchorPoint.SouthWest,
  },

  [WidgetType.DonationTicker]: {
    name: 'Donation Ticker',
    humanType: 'donation_ticker',
    url(host, token) {
      return `https://${host}/widgets/donation-ticker?token=${token}`;
    },

    width: 600,
    height: 200,

    x: 1,
    y: 1,

    anchor: AnchorPoint.SouthEast,
  },

  [WidgetType.ChatBox]: {
    name: 'Chat Box',
    humanType: 'chat_box',
    url(host, token) {
      return `https://${host}/widgets/chat-box/v1/${token}`;
    },

    width: 600,
    height: 600,

    x: 0,
    y: 0.5,

    anchor: AnchorPoint.West,
  },

  [WidgetType.EventList]: {
    name: 'Event List',
    humanType: 'event_list',
    url(host, token) {
      return `https://${host}/widgets/event-list/v1/${token}`;
    },

    width: 600,
    height: 600,

    x: 1,
    y: 0,

    anchor: AnchorPoint.NorthEast,
  },

  [WidgetType.TipJar]: {
    name: 'The Jar',
    humanType: 'tip_jar',
    url(host, token) {
      return `https://${host}/widgets/tip-jar/v1/${token}`;
    },

    width: 600,
    height: 600,

    x: 1,
    y: 0.5,

    anchor: AnchorPoint.East,
  },

  [WidgetType.StreamBoss]: {
    name: 'Stream Boss',
    humanType: 'streamboss',
    url(host, token) {
      return `https://${host}/widgets/streamboss?token=${token}`;
    },

    width: 600,
    height: 200,

    x: 0,
    y: 1,

    anchor: AnchorPoint.SouthWest,
  },

  [WidgetType.Credits]: {
    name: 'Credits',
    humanType: 'end_credits',
    url(host, token) {
      return `https://${host}/widgets/end-credits?token=${token}`;
    },

    width: 1280,
    height: 720,

    x: 0.5,
    y: 0.5,

    anchor: AnchorPoint.Center,
  },

  [WidgetType.SponsorBanner]: {
    name: 'Sponsor Banner',
    humanType: 'sponsor_banner',
    url(host, token) {
      return `https://${host}/widgets/sponsor-banner?token=${token}`;
    },

    width: 600,
    height: 200,

    x: 0,
    y: 1,

    anchor: AnchorPoint.SouthWest,
  },

  [WidgetType.SpinWheel]: {
    humanType: 'wheel',
    name: 'Spin Wheel',
    url(host, token) {
      return `https://${host}/widgets/wheel?token=${token}`;
    },

    width: 600,
    height: 800,

    x: 0,
    y: 1,

    anchor: AnchorPoint.SouthWest,
  },

  [WidgetType.MediaShare]: {
    name: 'Media Share',
    humanType: 'media-sharing',
    url(host, token) {
      return `https://${host}/widgets/media/v1/${token}`;
    },

    width: 800,
    height: 600,

    x: 0.5,
    y: 0,

    anchor: AnchorPoint.North,
  },
  [WidgetType.Poll]: {
    name: 'Poll',
    humanType: 'poll',
    url(host, token) {
      return `https://${host}/widgets/poll/${token}`;
    },

    width: 800,
    height: 400,

    x: 0.5,
    y: 0.5,

    anchor: AnchorPoint.Center,
  },
  [WidgetType.EmoteWall]: {
    name: 'Emote Wall',
    humanType: 'emote-wall',
    url(host, token) {
      return `https://${host}/widgets/emote-wall?token=${token}`;
    },

    width: 1280,
    height: 720,

    x: 0.5,
    y: 0.5,

    anchor: AnchorPoint.Center,
  },
  [WidgetType.ChatHighlight]: {
    name: 'Chat Highlight',
    humanType: 'chat_highlight',
    url(host, token) {
      return `https://${host}/widgets/chat-highlight?token=${token}`;
    },

    width: 600,
    height: 300,

    x: 0.5,
    y: 0.5,

    anchor: AnchorPoint.Center,
  },
  [WidgetType.ViewerCount]: {
    name: 'Viewer Count',
    humanType: 'viewer_count',
    url(host, token) {
      return `https://${host}/widgets/viewer-count?token=${token}`;
    },

    width: 600,
    height: 200,
    x: 0,
    y: 1,
    anchor: AnchorPoint.SouthWest,
  },
  // TODO: it seems we've half way transitioned to getWidgetsConfig but
  // this list is still referenced
  [WidgetType.GameWidget]: {
    name: 'Game Widget',
    humanType: 'game_widget',
    width: 400,
    height: 750,
    x: 0.5,
    y: 0,
    anchor: AnchorPoint.North,

    url(host, token) {
      return `https://${host}/widgets/game-widget?token=${token}`;
    },
  },
  [WidgetType.CustomWidget]: {
    name: 'Custom Widget',
    humanType: 'custom_widget',
    width: 400,
    height: 750,
    x: 0.5,
    y: 0,
    anchor: AnchorPoint.North,
    url(host, token) {
      return `https://${host}/widgets/custom-widget?token=${token}`;
    },
  },
};

export const WidgetDisplayData = (platform?: string): { [x: number]: IWidgetDisplayData } => ({
  [WidgetType.AlertBox]: {
    name: $t('Alert Box'),
    description: $t(
      'Custom on-screen alerts to thank your loyal viewers for following, subbing, tipping and more.',
    ),
    demoVideo: false,
    demoFilename: 'source-alertbox.png',
    supportList: [
      $t('Tips'),
      $t('Subscriptions'),
      $t('Follows'),
      $t('Bits'),
      $t('Platforms: Twitch, YouTube, Facebook, Trovo & integrations'),
    ],
    icon: 'icon-alert-box',
    shortDesc: $t('Dynamic live alerts'),
    group: 'essential',
  },
  [WidgetType.DonationGoal]: {
    name: $t('Tip Goal'),
    description: $t('Set a tip goal to encourage your viewers to contribute toward something.'),
    demoVideo: false,
    demoFilename: 'source-donation-goal.gif',
    supportList: [$t('Tips')],
    icon: 'fas fa-calendar',
    group: 'goals',
  },
  [WidgetType.FollowerGoal]: {
    name: platform === 'youtube' ? $t('Subscription Goal') : $t('Follower Goal'),
    description: $t('Set a follower goal for your viewers to help you reach.'),
    demoVideo: false,
    demoFilename: 'source-follower-goal.png',
    platforms: new Set(['twitch', 'facebook', 'youtube', 'trovo']),
    supportList: [
      $t('Twitch Followers'),
      $t('YouTube Subscribers'),
      $t('Facebook Followers'),
      $t('Trovo Followers'),
    ],
    icon: 'fas fa-calendar',
    group: 'goals',
  },
  [WidgetType.SubGoal]: {
    name: platform === 'youtube' ? $t('Member Goal') : $t('Subscription Goal'),
    description: $t('Set a subscriber goal for your viewers to help you reach.'),
    demoVideo: false,
    demoFilename: 'source-follower-goal.png',
    supportList: [
      $t('Twitch Subscribers'),
      $t('YouTube Members'),
      $t('Facebook Supporters'),
      $t('Trovo Subscribers'),
    ],
    platforms: new Set(['twitch', 'youtube']),
    icon: 'fas fa-calendar',
    group: 'goals',
  },
  [WidgetType.BitGoal]: {
    name: $t('Bit Goal'),
    description: $t('Set a bit goal for your viewers to help you reach.'),
    demoVideo: false,
    demoFilename: 'source-bit-goal.png',
    supportList: [$t('Twitch Bits')],
    platforms: new Set(['twitch']),
    icon: 'fas fa-calendar',
    group: 'goals',
  },
  [WidgetType.StarsGoal]: {
    name: $t('Stars Goal'),
    description: $t('Set a stars goal for your viewers to help you reach.'),
    demoVideo: false,
    demoFilename: 'source-bit-goal.png',
    supportList: [$t('Facebook Stars')],
    platforms: new Set(['facebook']),
    icon: 'fas fa-calendar',
    group: 'goals',
  },
  [WidgetType.SupporterGoal]: {
    name: $t('Supporter Goal'),
    description: $t('Set a goal for your viewers to help you reach.'),
    demoVideo: false,
    demoFilename: 'source-follower-goal.png',
    supportList: [$t('Facebook Supporters')],
    platforms: new Set(['facebook']),
    icon: 'fas fa-calendar',
    group: 'goals',
  },
  [WidgetType.CharityGoal]: {
    name: $t('Streamlabs Charity Donation Goal'),
    description: $t('Set a charity donation goal for your viewers to help you reach.'),
    demoVideo: false,
    demoFilename: 'source-charity-goal.gif',
    supportList: [$t('Streamlabs Charity Donations')],
    icon: 'fas fa-calendar',
    group: 'goals',
  },
  [WidgetType.SuperchatGoal]: {
    name: $t('Superchat Goal'),
    description: $t('Set a super chat goal for your viewers to help you reach.'),
    demoVideo: false,
    demoFilename: 'source-follower-goal.png',
    supportList: [$t('YouTube Superchats')],
    platforms: new Set(['youtube']),
    icon: 'fas fa-calendar',
    group: 'goals',
  },
  [WidgetType.DonationTicker]: {
    name: $t('Tip Ticker'),
    // TODO: show/display/showcase, "show off" is just so...
    description: $t('Show off the most recent tips from your viewers'),
    demoVideo: false,
    demoFilename: 'source-tip-ticker.png',
    supportList: [$t('Tips')],
    icon: 'fas fa-ellipsis-h',
    group: 'flair',
  },
  [WidgetType.ChatBox]: {
    name: $t('Chat Box'),
    description: $t('Display your chat on stream and set up sound notifications for new chats.'),
    shortDesc: $t('Display chatters on screen'),
    demoVideo: false,
    demoFilename: 'source-chatbox.png',
    supportList: [$t('Twitch chat'), $t('YouTube chat'), $t('Facebook chat'), $t('Trovo chat')],
    icon: 'fas fa-comments',
    group: 'essential',
  },
  [WidgetType.EventList]: {
    name: $t('Event List'),
    description: $t("Display your channel's most recent events on stream."),
    demoVideo: false,
    demoFilename: 'source-eventlist.png',
    supportList: [
      $t('Tips'),
      $t('Subscribers'),
      $t('Followers'),
      $t('Bits'),
      $t('Super Chats'),
      $t('Supporters'),
      $t('Charity donations'),
      $t('Platform support: Twitch, YouTube, Facebook, Trovo'),
    ],
    icon: 'fas fa-th-list',
    shortDesc: $t('Display recent events'),
    group: 'essential',
  },
  [WidgetType.TipJar]: {
    name: $t('The Jar'),
    description: $t('A jar that catches bits, tips, subs and more.'),
    demoVideo: false,
    demoFilename: 'source-jar.png',
    supportList: [
      $t('Tips'),
      $t('Subscriptions'),
      $t('Follows'),
      $t('Bits'),
      $t('Platform support: Twitch, YouTube, Facebook, Trovo'),
    ],
    icon: 'fas fa-beer',
    group: 'interactive',
  },
  [WidgetType.ViewerCount]: {
    name: $t('Viewer Count'),
    description: $t('Show off the count of live viewers by platform.'),
    demoVideo: false,
    demoFilename: 'source-viewer-count.png',
    supportList: ['YouTube', 'Twitch', 'Facebook', 'Trovo'],
    icon: 'fas fa-eye',
    group: 'essential',
  },
  [WidgetType.StreamBoss]: {
    name: $t('Stream Boss'),
    description: $t(
      'Let your viewers duke it out by subbing, tipping and more to become the Stream Boss.',
    ),
    demoVideo: false,
    demoFilename: 'source-streamboss.png',
    supportList: [$t('Twitch Bits'), $t('Platform support: Twitch, YouTube, Facebook, Trovo')],
    icon: 'fas fa-gavel',
    group: 'interactive',
  },
  [WidgetType.Credits]: {
    name: $t('Credits'),
    description: $t(
      'Roll credits at the end of your broadcast to thank supporters for tipping, following, subbing, modding and more.',
    ),
    demoVideo: false,
    demoFilename: 'source-credits.png',
    supportList: [
      $t('New Followers'),
      $t('New Subscribers'),
      $t('Cheers'),
      $t('Tips'),
      $t('Platform support: Twitch, YouTube, Facebook, Trovo'),
    ],
    platforms: new Set(['twitch', 'youtube']),
    icon: 'fas fa-align-center',
    group: 'flair',
  },
  [WidgetType.SponsorBanner]: {
    name: $t('Sponsor Banner'),
    description: $t(
      'Show off rotating media to display your socials, sponsorships, CTAs or just cute animations.',
    ),
    demoVideo: false,
    demoFilename: 'source-sponsor-banner.png',
    supportList: [$t('The streamer manually adds images of sponsors.')],
    icon: 'fas fa-heart',
    group: 'flair',
  },
  [WidgetType.SpinWheel]: {
    name: $t('Spin Wheel'),
    description: $t('Let your viewers spin a custom spin wheel to win prizes or incentives.'),
    demoVideo: false,
    demoFilename: 'source-wheel.png',
    supportList: [$t('The streamer manually triggers a spin anytime while they are live.')],
    icon: 'fas fa-chart-pie',
    group: 'interactive',
  },
  [WidgetType.MediaShare]: {
    name: $t('Media Share'),
    description: $t('Allow your viewers to tip to share videos on your stream.'),
    demoVideo: false,
    demoFilename: 'media.png',
    supportList: [],
    icon: 'icon-share',
    group: 'interactive',
  },
  [WidgetType.Poll]: {
    name: $t('Poll'),
    description: $t('Let your viewers vote on a result'),
    demoVideo: false,
    demoFilename: 'poll.png',
    supportList: [$t('Twitch'), $t('YouTube')],
    icon: 'icon-text-align-left',
    group: 'interactive',
  },
  [WidgetType.EmoteWall]: {
    name: $t('Emote Wall'),
    description: $t('Display and animate emotes from chat, improving chat participation.'),
    demoVideo: false,
    demoFilename: 'emote-wall.gif',
    supportList: [],
    platforms: new Set(['twitch']),
    icon: 'icon-smile',
    group: 'interactive',
  },
  [WidgetType.ChatHighlight]: {
    name: $t('Chat Highlight'),
    description: $t('Highlight chat messages from your viewers on your stream.'),
    demoVideo: false,
    demoFilename: 'chat-highlight.png',
    supportList: [],
    platforms: new Set(['twitch']),
    icon: 'icon-community',
    group: 'interactive',
  },
  [WidgetType.GameWidget]: {
    name: $t('Game Widget'),
    description: $t('Allow your chat to play games together while you are live.'),
    demoVideo: false,
    demoFilename: 'game-widget.png',
    supportList: [],
    platforms: new Set(['twitch', 'youtube']),
    icon: 'icon-face-masks',
    group: 'interactive',
  },
  [WidgetType.CustomWidget]: {
    name: $t('Custom Widget'),
    description: $t('Use HTML, CSS, and JavaScript to create a widget with custom functionality'),
    demoVideo: false,
    demoFilename: '', // do not show an image
    supportList: [],
    icon: 'icon-developer',
    group: 'flair',
  },
});
