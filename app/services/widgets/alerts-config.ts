import { $t } from '../i18n';
import { TPlatform } from '../platforms';
export type TAlertType =
  | 'donation'
  | 'merch'
  | 'follow'
  | 'sub'
  | 'resub'
  | 'bits'
  | 'raid'
  | 'subscriber'
  | 'sponsor'
  | 'membershipGift'
  | 'fanfunding' // SuperChat
  | 'facebook_share'
  | 'facebook_support'
  | 'facebook_support_gifter'
  | 'facebook_stars'
  | 'facebook_like'
  | 'facebook_follow'
  | 'trovo_follow'
  | 'trovo_sub'
  | 'trovo_raid'
  | 'twitchcharitydonation'
  | 'loyalty_store_redemption'
  | 'pledge'
  | 'streamlabscharitydonation'
  | 'eldonation'
  | 'tiltify_donation'
  | 'treat'
  | 'donordrive_donation'
  | 'justgiving_donation';

export interface IAlertConfig {
  type: TAlertType;
  apiKey?: string;
  name: string;
  platforms?: TPlatform[];
  names?: string[];
  tooltip?: string;
  tooltipLink?: string;
}

export function getAlertsConfig(
  host: string,
  platforms: TPlatform[] = [],
): Record<TAlertType, IAlertConfig> {
  return {
    donation: {
      type: 'donation',
      name: $t('Donation'),
      tooltip: $t('Plays an alert when a viewer sends a tip/donation'),
    },

    follow: {
      type: 'follow',
      name: $t('Follow'),
      apiKey: 'follow',
      platforms: ['twitch'],
      tooltip: $t('Plays an alert for new Twitch followers'),
    },

    facebook_follow: {
      type: 'facebook_follow',
      apiKey: 'facebook_follow',
      name: $t('Facebook Follow'),
      platforms: ['facebook'],
      tooltip: $t('Plays an alert for new Facebook followers'),
    },

    trovo_follow: {
      type: 'trovo_follow',
      name: $t('Trovo Follow'),
      apiKey: 'trovo_follow',
      platforms: ['trovo'],
      tooltip: $t('Plays an alert for new Trovo followers'),
    },

    sub: {
      type: 'sub',
      apiKey: 'sub',
      name: $t('Subscription'),
      platforms: ['twitch'],
      tooltip: $t('Plays an alert for new Twitch subscriptions'),
      tooltipLink: 'https://help.twitch.tv/s/article/how-to-subscribe',
    },

    trovo_sub: {
      type: 'trovo_sub',
      apiKey: 'trovo_sub',
      name: $t('Trovo Subscription'),
      platforms: ['trovo'],
      tooltip: $t('Plays an alert for new Trovo subscriptions'),
    },

    bits: {
      type: 'bits',
      apiKey: 'bits',
      name: $t('Cheer (Bits)'),
      platforms: ['twitch'],
      tooltip: $t('Plays an alert when a viewer sends a Cheer'),
      tooltipLink: 'https://help.twitch.tv/s/article/guide-to-cheering-with-bits',
    },

    raid: {
      name: $t('Raid'),
      type: 'raid',
      apiKey: 'raid',
      platforms: ['twitch'],
      tooltip: $t('Plays an alert when another streamer raids your channel'),
      tooltipLink: 'https://help.twitch.tv/s/article/how-to-use-raids',
    },

    trovo_raid: {
      name: $t('Trovo Raid'),
      type: 'trovo_raid',
      apiKey: 'trovo_raid',
      platforms: ['trovo'],
      tooltip: $t('Plays an alert when another streamer raids your channel'),
    },

    sponsor: {
      name: $t('YouTube Membership'),
      type: 'sponsor',
      apiKey: 'sponsor',
      platforms: ['youtube'],
      tooltip: $t('Plays an alert for new YouTube Memberships'),
      tooltipLink: 'https://creatoracademy.youtube.com/page/course/channel-memberships',
    },

    fanfunding: {
      name: $t('YouTube Super Chat'),
      type: 'fanfunding',
      apiKey: 'fanfunding',
      platforms: ['youtube'],
      tooltip: $t('Plays an alert when a viewer sends a Super Chat'),
      tooltipLink:
        'https://creatoracademy.youtube.com/page/lesson/superchat-and-superstickers_what-is-superchat_video',
    },

    facebook_support: {
      name: $t('Facebook Support'),
      type: 'facebook_support',
      apiKey: 'facebook_support',
      platforms: ['facebook'],
      tooltip: $t('Plays an alert for new Facebook Supporters'),
      tooltipLink: 'https://www.facebook.com/business/help/316098022481499',
    },

    facebook_support_gifter: {
      name: $t('Facebook Gifted Support'),
      type: 'facebook_support_gifter',
      apiKey: 'facebook_support_gifter',
    },

    facebook_stars: {
      name: $t('Facebook Stars'),
      apiKey: 'facebook_stars',
      type: 'facebook_stars',
      platforms: ['facebook'],
      tooltip: $t('Plays an alert when a viewer sends Stars'),
      tooltipLink: 'https://www.facebook.com/business/help/903272529876480',
    },

    facebook_like: {
      name: $t('Facebook Like'),
      apiKey: 'facebook_like',
      type: 'facebook_like',
      platforms: ['facebook'],
      tooltip: $t('Plays an alert when a viewer likes your stream'),
    },

    facebook_share: {
      name: $t('Facebook Share'),
      apiKey: 'facebook_share',
      type: 'facebook_share',
      platforms: ['facebook'],
      tooltip: $t('Plays an alert when a viewer shares your stream'),
    },

    merch: {
      name: $t('Merch'),
      type: 'merch',
      tooltip: $t('Plays an alert when a viewer buys your merch'),
      tooltipLink: 'https://streamlabs.com/dashboard#/merchadmin',
    },

    subscriber: {
      name: $t('YouTube Subscribers'),
      type: 'subscriber',
      apiKey: 'subscriber',
      platforms: ['youtube'],
      tooltip: $t('Plays an alert when a viewer subscribes to your YouTube channel'),
    },
    // TODO: Implement these when needed
    donordrive_donation: undefined,
    eldonation: undefined,
    justgiving_donation: undefined,
    loyalty_store_redemption: undefined,
    membershipGift: undefined,
    pledge: undefined,
    resub: undefined,
    streamlabscharitydonation: undefined,
    tiltify_donation: undefined,
    treat: undefined,
    twitchcharitydonation: undefined,
  };
}
