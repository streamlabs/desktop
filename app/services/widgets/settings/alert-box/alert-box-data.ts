import uuid from 'uuid/v4';
import { IAlertBoxVariation } from './alert-box-api';
import { $t } from 'services/i18n';
import { metadata } from 'components/widgets/inputs';

export const API_NAME_MAP = {
  bit: 'bits',
  donation: 'donations',
  donordrivedonation: 'donordrive',
  pledge: 'patreon',
  eldonation: 'extraLife',
  justgivingdonation: 'justGiving',
  merch: 'merch',
  resub: 'resubs',
  gamewispsubscription: 'gamewisp',
  sub: 'subs',
  tiltifydonation: 'tiltify',
  treat: 'treat',
  follow: 'follows',
  superheart: 'superhearts',
  fanfunding: 'fanfunding',
  raid: 'raids',
  subscriber: 'subscribers', // YouTube
  sponsor: 'sponsors',
  facebook_support_gifter: 'giftSupport',
  facebook_support: 'support',
  facebook_like: 'likes',
  facebook_stars: 'stars',
  facebook_share: 'shares',
  facebook_follow: 'fbfollows',
  loyalty_store_redemption: 'loyaltystore',
  trovo_follow: 'trovo_follow',
  trovo_sub: 'trovo_sub',
  trovo_raid: 'trovo_raid',
};

export const alertNameMap = () => ({
  bits: $t('Bits'),
  donations: $t('Donations'),
  donordrive: $t('Charity Streaming Donations'),
  patreon: $t('Patreon Pledges'),
  extraLife: $t('Extra Life Donations'),
  justGiving: $t('JustGiving Donations'),
  merch: $t('Merch'),
  resubs: $t('Resubs'),
  gamewisp: $t('Gamewisp Subscriptions'),
  subs: $t('Subscriptions'),
  tiltify: $t('Tiltify Donations'),
  treat: $t('TreatStream'),
  follows: $t('Follows'),
  superhearts: $t('Super Hearts'),
  fanfunding: $t('Super Chat'),
  sponsors: $t('Members'),
  raids: $t('Raids'),
  subscribers: $t('Subscribers'), // YouTube
  stars: $t('Stars'),
  support: $t('Support'),
  giftSupport: $t('Gifted Support'),
  likes: $t('Likes'),
  shares: $t('Shares'),
  fbfollows: $t('Follows'),
  loyaltystore: $t('Cloudbot Store'),
  stickers: $t('Stickers'),
  effects: $t('Effects/Rallies'),
  trovo_follow: $t('Trovo Follow'),
  trovo_sub: $t('Trovo Subscription'),
  trovo_raid: $t('Trovo Raid'),
});

// different tests are required due to api idiosyncracies
const determineTester = (key: string) => {
  switch (key) {
    case 'facebook_stars':
      return new RegExp(`^${key}_|facebook_show_stars_`);
    case 'facebook_support':
      return new RegExp(`^${key}s?_(?!gifter)|show_${key}_(?!gifter)`);
    default:
      return new RegExp(`^${key}s?_|show_${key}_`);
  }
};

export const REGEX_TESTERS = Object.keys(API_NAME_MAP).map(key => ({
  // TODO: index
  // @ts-ignore
  name: API_NAME_MAP[key],
  tester: determineTester(key),
}));

export const conditions = () => ({
  base: [{ value: 'RANDOM', title: $t('Randomly') }],
  donations: [
    { value: 'MIN_DONATION_AMOUNT', title: $t('Donation amount is at least <amount>') },
    { value: 'EXACT_DONATION_AMOUNT', title: $t('Donation amount is exactly <amount>') },
    { value: 'LARGEST_OF_STREAM', title: $t('Donation is the largest this stream') },
    { value: 'RECURRING_DONATION', title: $t('Donation is recurring') },
  ],
  subs: [
    { value: 'MIN_MONTHS_SUBSCRIBED', title: $t('Months subscribed is at least <months>') },
    { value: 'EXACT_MONTHS_SUBSCRIBED', title: $t('Months subscribed is exactly <months>') },
    { value: 'SUBSCRIPTION_TIER', title: $t('Subscription tier is <tier>') },
    { value: 'SUBSCRIPTION_PRIME', title: $t('Subscription is Twitch Prime') },
    { value: 'SUBSCRIPTION_GIFT', title: $t('When subscription is a gift') },
    { value: 'MIN_SUBMYSTERYGIFT', title: $t('User gifted at least <amount> subs at once') },
    { value: 'SUBTEMBER', title: $t('When user commits to continue their gift subscription') },
    {
      value: 'MIN_SUBSCRIPTION_STREAK',
      title: $t('Streak shared with chat, and months subscribed in a streak is at least <months>'),
    },
    {
      value: 'SUBSCRIPTION_PRIME_UPGRADE',
      title: $t('When a Prime Gaming sub is upgraded to a recurring <tier> sub'),
    },
  ],
  bits: [
    { value: 'MIN_BITS_USED', title: $t('Bits used is at least <amount>') },
    { value: 'EXACT_BITS_USED', title: $t('Bits used is exactly <amount>') },
  ],
  raids: [{ value: 'MIN_RAIDERS_ACQUIRED', title: $t('Raid party size is at least <raiders>') }],
  sponsors: [
    { value: 'MIN_MONTHS_SPONSORED', title: $t('Months as a member is at least <months>') },
  ],
  fanfunding: [
    { value: 'MIN_FANFUNDING_AMOUNT', title: $t('Super Chat amount is at least <amount>') },
    { value: 'EXACT_FANFUNDING_AMOUNT', title: $t('Super Chat amount is exactly <amount>') },
  ],
  superhearts: [
    { value: 'MIN_SUPERHEART_COIN', title: $t('Super Hearts coins is at least <coin>') },
    { value: 'EXACT_SUPERHEART_COIN', title: $t('Super Heart coins is exactly <coin>') },
  ],
  patreon: [
    { value: 'MIN_PLEDGE_AMOUNT', title: $t('Pledge amount is at least <amount>') },
    { value: 'EXACT_PLEDGE_AMOUNT', title: $t('Pledge amount is exactly <amount>') },
  ],
  extraLife: [
    { value: 'MIN_EXTRALIFE_DONATION_AMOUNT', title: $t('Donation amount is at least <amount>') },
    { value: 'EXACT_EXTRALIFE_DONATION_AMOUNT', title: $t('Donation amount is exactly <amount>') },
  ],
  tilitfy: [
    { value: 'MIN_TILTIFY_DONATION_AMOUNT', title: $t('Donation amount is at least <amount>') },
    { value: 'EXACT_TILTIFY_DONATION_AMOUNT', title: $t('Donation amount is exactly <amount>') },
  ],
  gamewisp: [
    { value: 'GAMEWISP_SUBSCRIPTION_TIER', title: $t('Subscription tier is <tier>') },
    {
      value: 'MIN_GAMEWISP_MONTHS_SUBSCRIBED',
      title: $t('Months subscribed is at least <months>'),
    },
    {
      value: 'EXACT_GAMEWISP_MONTHS_SUBSCRIBED',
      title: $t('Months subscribed is exactly <months>'),
    },
  ],
  donordrive: [
    { value: 'MIN_DONORDRIVE_DONATION_AMOUNT', title: $t('Donation amount is at least <amount>') },
    { value: 'EXACT_DONORDRIVE_DONATION_AMOUNT', title: $t('Donation amount is exactly <amount>') },
  ],
  justGiving: [
    { value: 'MIN_JUSTGIVING_DONATION_AMOUNT', title: $t('Donation amount is at least <amount>') },
    { value: 'EXACT_JUSTGIVING_DONATION_AMOUNT', title: $t('Donation amount is exactly <amount>') },
  ],
  merch: [
    { value: 'MERCH_PRODUCT', title: $t('Product') },
    { value: 'MERCH_PREORDER', title: $t('Preorder') },
  ],
  loyaltystore: [
    { value: 'LOYALTY_STORE_REDEMPTION_ITEM_TYPE', title: $t('Item type is <type>') },
    { value: 'LOYALTY_STORE_REDEMPTION_ITEM_NAME', title: $t('Item name is <name>') },
  ],
  support: [
    { value: 'SUPPORT_GIFT_REDEEMED', title: $t('Viewer redeemed a gifted Support') },
    { value: 'MIN_MONTHS_SUPPORTED', title: $t('Months supported is at least <months>') },
    { value: 'EXACT_MONTHS_SUPPORTED', title: $t('Months supported is exactly <months>') },
  ],
  giftSupport: [
    { value: 'MIN_SUPPORT_GIFTS', title: $t('Gifted at least <amount> Supports') },
    { value: 'EXACT_SUPPORT_GIFTS', title: $t('Gifted exactly <amount> Supports') },
  ],
  stars: [
    { value: 'MIN_STARS_USED', title: $t('Stars used is at least <amount>') },
    { value: 'EXACT_STARS_USED', title: $t('Stars used is exactly <amount>') },
  ],
});

export const conditionData = () => ({
  RANDOM: metadata.frequency({ title: $t('Variation Frequency') }),
  SUBSCRIPTION_GIFT: metadata.frequency({ title: $t('Variation Frequency') }),
  SUBSCRIPTION_PRIME: metadata.frequency({ title: $t('Variation Frequency') }),
  SUBTEMBER: metadata.frequency({ title: $t('Variation Frequency') }),
  SUBSCRIPTION_PRIME_UPGRADE: metadata.frequency({ title: $t('Variation Frequency') }),
  ANON_SUBSCRIPTION_GIFT: metadata.frequency({ title: $t('Variation Frequency') }),
  SUB_EXTENDED: metadata.frequency({ title: $t('Variation Frequency') }),
  SUPPORT_GIFT_REDEEMED: metadata.frequency({ title: $t('Variation Frequency') }),
  LARGEST_OF_STREAM: {},
  MERCH_PRODUCT: {},
  MERCH_PREORDER: {},
  RECURRING_DONATION: {},
  LOYALTY_STORE_REDEMPTION_ITEM_TYPE: metadata.list({
    title: $t('Item Type'),
    options: [
      { value: 'perk', title: 'Perk' },
      { value: 'sound', title: 'Sound' },
      { value: 'code', title: 'Code' },
    ],
  }),
  LOYALTY_STORE_REDEMPTION_ITEM_NAME: metadata.text({ title: $t('Item Name'), max: 50 }),
});

export const newVariation = (type: string): IAlertBoxVariation => ({
  condition: 'RANDOM',
  conditions: [],
  conditionData: '3',
  name: 'New Variation',
  deleteable: true,
  id: uuid(),
  settings: {
    customCss: '',
    customHtml: '',
    customHtmlEnabled: false,
    customJs: '',
    customJson: '',
    duration: 8,
    hideAnimation: 'fadeOut',
    image: {
      href:
        type === 'merch'
          ? 'https://cdn.streamlabs.com/merch/Mug_mockup.png'
          : 'http://uploads.twitchalerts.com/image-defaults/1n9bK4w.gif',
    },
    layout: 'above',
    showAnimation: 'fadeIn',
    sound: { href: '', volume: 80 },
    text: {
      animation: 'tada',
      color: '#FFFFFF',
      color2: '#32C3A6',
      font: 'Open Sans',
      // TODO: index
      // @ts-ignore
      format: DEFAULT_ALERT_FORMATS[type] || '',
      resubFormat: null,
      tierUpgradeFormat: null,
      size: 32,
      thickness: 400,
    },
    textDelay: 0,
    // TODO: index
    // @ts-ignore
    type: Object.keys(API_NAME_MAP).find(key => API_NAME_MAP[key] === type),
    useCustomImage: null,
    moderation: null,
  },
});

const DEFAULT_ALERT_FORMATS = {
  bits: '{name} Cheered! x{amount}',
  donations: '{name} has just donated {amount}!',
  donordrive: '{name} has just donated {amount} via Charity Streaming!',
  patreon: '{name} has just pledged {amount} via Patreon!',
  extraLife: '{name} has just donated {amount} via Extra Life!',
  justGiving: '{name} has just donated {amount} via JustGiving!',
  merch: '{name} bought {product}!',
  resubs: '{name} just resubbed for {months} months!',
  gamewisp: '{name} just subscribed via Gamewisp!',
  subs: '{name} just subscribed!',
  tiltify: '{name} has just donated {amount} via Tiltify!',
  treat: '{name} bought you a {title} treat via Treatstream!',
  follows: '{name} is now following!',
  superhearts: '{name} gifted {style} worth {amount} coins!',
  fanfunding: '{name} has just donated {amount} through Super Chat!',
  subscribers: '{name} just subscribed!', // YouTube
  raids: '{name} is raiding with a party of {count}!',
  sponsors: '{name} has sponsored you {months} months in a row!',
  support: '{name} has supported for {months} months!',
  likes: '{name} has liked!',
  stars: '{name} has given {amount} stars!',
  shares: '{name} has shared!',
  fbfollows: '{name} has followed!',
  loyaltystore: '{name} redeemed {product}',
};
