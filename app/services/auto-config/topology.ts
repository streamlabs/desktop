import { IGoLiveSettings } from 'services/streaming';
import { TPlatform } from 'services/platforms';
import {
  IAutoOptimizerDestination,
  IAutoOptimizerProfile,
  IAutoOptimizerTopology,
  IAutoOptimizerTopologyLeg,
  TAutoOptimizerPlatform,
  TAutoOptimizerTopologyType,
} from './types';

const supportedPlatforms: TAutoOptimizerPlatform[] = [
  'twitch',
  'youtube',
  'facebook',
  'kick',
  'tiktok',
  'custom',
];

function normalizePlatform(platform: string): TAutoOptimizerPlatform {
  return supportedPlatforms.includes(platform as TAutoOptimizerPlatform)
    ? (platform as TAutoOptimizerPlatform)
    : 'other';
}

function enabledPlatforms(settings: IGoLiveSettings): TPlatform[] {
  return Object.keys(settings.platforms).filter(
    platform => settings.platforms[platform as TPlatform]?.enabled,
  ) as TPlatform[];
}

function destination(platform: string): IAutoOptimizerDestination {
  return { platform: normalizePlatform(platform) };
}

function getEstimateReason(type: TAutoOptimizerTopologyType): string {
  switch (type) {
    case 'direct-single':
      return 'non_twitch';
    case 'custom-rtmp':
      return 'custom_rtmp';
    case 'cloud-multistream':
      return 'cloud_multistream';
    case 'dual-output':
      return 'dual_output';
    case 'enhanced-broadcasting':
      return 'enhanced_broadcasting';
    case 'stream-shift':
      return 'stream_shift';
    default:
      return 'mixed_topology';
  }
}

/**
 * Describe the upload legs that Desktop will actually create. This function is
 * deliberately credential-free and is safe to call in any renderer.
 */
export function classifyAutoOptimizerTopology(
  settings: IGoLiveSettings,
  dualOutputMode: boolean,
  twitchDualStreamAccess = false,
): IAutoOptimizerTopology {
  const platforms = enabledPlatforms(settings);
  // `dualStream` custom entries are implementation details generated for a
  // platform already represented in `platforms`; counting them would invent a
  // second upload leg.
  const customDestinations = settings.customDestinations.filter(
    item => item.enabled && !item.dualStream,
  );
  const twitchSettings = settings.platforms.twitch;
  const enhancedBroadcasting = Boolean(
    settings.enhancedBroadcasting || twitchSettings?.isEnhancedBroadcasting,
  );
  const streamShift = Boolean(settings.streamShift);
  const hasCustom = customDestinations.length > 0;
  const targetCount = platforms.length + customDestinations.length;

  let type: TAutoOptimizerTopologyType;
  if (enhancedBroadcasting) {
    type = 'enhanced-broadcasting';
  } else if (streamShift) {
    type = 'stream-shift';
  } else if (dualOutputMode) {
    type = hasCustom && platforms.length > 0 ? 'mixed' : 'dual-output';
  } else if (hasCustom && platforms.length > 0) {
    type = 'mixed';
  } else if (hasCustom) {
    type = 'custom-rtmp';
  } else if (targetCount > 1) {
    type = 'cloud-multistream';
  } else {
    type = 'direct-single';
  }

  const activeBandwidthTest =
    type === 'direct-single' &&
    platforms.length === 1 &&
    platforms[0] === 'twitch' &&
    customDestinations.length === 0;

  const allDestinations: IAutoOptimizerDestination[] = [
    ...platforms.map(destination),
    ...customDestinations.map(() => destination('custom')),
  ];

  let legs: IAutoOptimizerTopologyLeg[];
  const isSingleConnectionTwitchDual =
    dualOutputMode &&
    twitchDualStreamAccess &&
    platforms.length === 1 &&
    platforms[0] === 'twitch' &&
    twitchSettings?.display === 'both' &&
    customDestinations.length === 0;

  if (isSingleConnectionTwitchDual) {
    legs = [
      {
        legId: 'twitch-dual',
        display: 'both',
        destinations: [destination('twitch')],
        measurement: 'estimated',
        estimateReason: getEstimateReason(type),
      },
    ];
  } else if (!dualOutputMode) {
    legs = [
      {
        legId: 'horizontal',
        display: 'horizontal',
        destinations: allDestinations,
        measurement: activeBandwidthTest ? 'active' : 'estimated',
        estimateReason: activeBandwidthTest ? undefined : getEstimateReason(type),
      },
    ];
  } else {
    const byDisplay = {
      horizontal: [] as IAutoOptimizerDestination[],
      vertical: [] as IAutoOptimizerDestination[],
    };

    platforms.forEach(platform => {
      const display = settings.platforms[platform]?.display ?? 'horizontal';
      if (display === 'both') {
        byDisplay.horizontal.push(destination(platform));
        byDisplay.vertical.push(destination(platform));
      } else {
        byDisplay[display].push(destination(platform));
      }
    });
    customDestinations.forEach(item => {
      const display = item.display ?? 'horizontal';
      byDisplay[display].push(destination('custom'));
    });

    legs = (['horizontal', 'vertical'] as const)
      .filter(display => byDisplay[display].length > 0)
      .map(display => ({
        legId: display,
        display,
        destinations: byDisplay[display],
        measurement: 'estimated' as const,
        estimateReason: getEstimateReason(type),
      }));
  }

  // Invalid/empty destination states are rejected by Go Live validation. Keep
  // the classifier total so capability checks and tests never need to handle an
  // undefined topology.
  if (!legs.length) {
    legs = [
      {
        legId: 'horizontal',
        display: 'horizontal',
        destinations: [],
        measurement: 'estimated',
        estimateReason: getEstimateReason(type),
      },
    ];
  }

  return { type, activeBandwidthTest, legs };
}

/**
 * An optimizer profile is attempt-scoped. It can be carried through the
 * editable Go Live form only while the upload legs it was calculated for are
 * unchanged.
 */
export function isAutoOptimizerProfileCompatible(
  profile: IAutoOptimizerProfile,
  settings: IGoLiveSettings,
  dualOutputMode: boolean,
  twitchDualStreamAccess = false,
): boolean {
  if (profile.schemaVersion !== 1) return false;

  const topology = classifyAutoOptimizerTopology(
    settings,
    dualOutputMode,
    twitchDualStreamAccess,
  );
  if (profile.topology !== topology.type || profile.legs.length !== topology.legs.length) {
    return false;
  }

  return topology.legs.every(topologyLeg => {
    const profileLeg = profile.legs.find(leg => leg.legId === topologyLeg.legId);
    if (!profileLeg || profileLeg.display !== topologyLeg.display) return false;

    const topologyDestinations = topologyLeg.destinations
      .map(destination => destination.platform)
      .sort();
    const profileDestinations = profileLeg.destinations
      .map(destination => destination.platform)
      .sort();

    return (
      topologyDestinations.length === profileDestinations.length &&
      topologyDestinations.every(
        (destination, index) => destination === profileDestinations[index],
      )
    );
  });
}
