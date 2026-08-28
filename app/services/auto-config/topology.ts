import { IGoLiveSettings } from 'services/streaming';
import { TPlatform } from 'services/platforms';
import {
  IAutoOptimizerDestination,
  IAutoOptimizerProbeCandidate,
  IAutoOptimizerProfile,
  IAutoOptimizerTopology,
  IAutoOptimizerTopologyLeg,
  TAutoOptimizerPlatform,
  TAutoOptimizerProbeProvider,
  TAutoOptimizerUploadRoute,
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
    case 'enhanced-broadcasting-dual-output':
      return 'enhanced_broadcasting';
    case 'stream-shift':
      return 'stream_shift';
    default:
      return 'mixed_topology';
  }
}

const probeProviderOrder: TAutoOptimizerProbeProvider[] = ['twitch', 'youtube'];

function probeCandidates(
  legId: string,
  destinations: IAutoOptimizerDestination[],
  allowed: boolean,
  type: TAutoOptimizerTopologyType,
): IAutoOptimizerProbeCandidate[] {
  if (!allowed) return [];

  const platforms = new Set(destinations.map(item => item.platform));
  return probeProviderOrder
    .filter(platform => platforms.has(platform))
    .map(provider => {
      let kind: IAutoOptimizerProbeCandidate['kind'] = 'youtube-unbound';
      if (provider === 'twitch') {
        kind =
          type === 'enhanced-broadcasting' || type === 'enhanced-broadcasting-dual-output'
            ? 'twitch-enhanced-broadcasting'
            : 'twitch-standard';
      }
      return { probeId: `${legId}-${provider}`, kind, legId, provider };
    });
}

function uploadRoute(destinations: IAutoOptimizerDestination[]): TAutoOptimizerUploadRoute {
  return destinations.length > 1 ? 'cloud-restream' : 'direct';
}

function completeLeg(
  leg: Omit<
    IAutoOptimizerTopologyLeg,
    'route' | 'probeCandidates' | 'measurement' | 'estimateReason'
  >,
  type: TAutoOptimizerTopologyType,
  allowProbes: boolean,
): IAutoOptimizerTopologyLeg {
  const candidates = probeCandidates(leg.legId, leg.destinations, allowProbes, type);
  return {
    ...leg,
    route: uploadRoute(leg.destinations),
    probeCandidates: candidates,
    measurement: candidates.length ? 'active' : 'estimated',
    estimateReason: candidates.length ? undefined : getEstimateReason(type),
  };
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
  const streamShift = Boolean(settings.streamShift);
  const hasCustom = customDestinations.length > 0;
  const isSingleConnectionTwitchDual =
    dualOutputMode &&
    twitchDualStreamAccess &&
    !streamShift &&
    platforms.length === 1 &&
    platforms[0] === 'twitch' &&
    twitchSettings?.display === 'both' &&
    !twitchSettings?.useCustomFields &&
    !hasCustom;
  // Twitch Dual Stream is implemented by the same Enhanced Broadcasting
  // connection with a paired vertical video, even when its persisted toggle is
  // false. Classify the actual output topology rather than only the form field.
  const enhancedBroadcasting = Boolean(
    settings.enhancedBroadcasting ||
      twitchSettings?.isEnhancedBroadcasting ||
      isSingleConnectionTwitchDual,
  );
  const isEnhancedBroadcastingDualOutput =
    dualOutputMode &&
    twitchDualStreamAccess &&
    enhancedBroadcasting &&
    !streamShift &&
    !hasCustom &&
    platforms.includes('twitch') &&
    platforms.some(platform => platform !== 'twitch') &&
    twitchSettings?.display === 'both' &&
    !twitchSettings?.useCustomFields;
  const targetCount = platforms.length + customDestinations.length;

  let type: TAutoOptimizerTopologyType;
  if (isEnhancedBroadcastingDualOutput) {
    type = 'enhanced-broadcasting-dual-output';
  } else if (enhancedBroadcasting) {
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

  // Custom RTMP credentials and Stream Shift must never be used for active
  // testing. Enhanced Broadcasting has a separate workload probe whose V1
  // safety boundary is a Twitch-only connection: either one horizontal canvas
  // or the exact Dual Stream pairing of horizontal and vertical video.
  const enhancedBroadcastingProbeEligible =
    type === 'enhanced-broadcasting' &&
    !streamShift &&
    !hasCustom &&
    platforms.length === 1 &&
    platforms[0] === 'twitch' &&
    !twitchSettings?.useCustomFields &&
    (!dualOutputMode || isSingleConnectionTwitchDual);
  const enhancedBroadcastingDualOutputProbeEligible =
    type === 'enhanced-broadcasting-dual-output';
  const allowProbes =
    enhancedBroadcastingProbeEligible ||
    enhancedBroadcastingDualOutputProbeEligible ||
    !['custom-rtmp', 'mixed', 'enhanced-broadcasting', 'stream-shift'].includes(type);

  const allDestinations: IAutoOptimizerDestination[] = [
    ...platforms.map(destination),
    ...customDestinations.map(() => destination('custom')),
  ];

  let legs: IAutoOptimizerTopologyLeg[];
  if (isEnhancedBroadcastingDualOutput) {
    const byDisplay = {
      horizontal: [] as IAutoOptimizerDestination[],
      vertical: [] as IAutoOptimizerDestination[],
    };
    platforms
      .filter(platform => platform !== 'twitch')
      .forEach(platform => {
        const display = settings.platforms[platform]?.display ?? 'horizontal';
        if (display === 'both') {
          byDisplay.horizontal.push(destination(platform));
          byDisplay.vertical.push(destination(platform));
        } else {
          byDisplay[display].push(destination(platform));
        }
      });
    legs = [
      completeLeg(
        {
          legId: 'twitch-enhanced-broadcasting',
          display: 'both',
          outputKind: 'twitch-enhanced-broadcasting',
          destinations: [destination('twitch')],
        },
        type,
        allowProbes,
      ),
      ...(['horizontal', 'vertical'] as const)
        .filter(display => byDisplay[display].length > 0)
        .map(display =>
          completeLeg(
            {
              legId: `${display}-standard`,
              display,
              outputKind: 'standard',
              destinations: byDisplay[display],
            },
            type,
            allowProbes,
          ),
        ),
    ];
  } else if (isSingleConnectionTwitchDual) {
    legs = [
      completeLeg(
        {
          legId: 'twitch-dual',
          display: 'both',
          outputKind: 'twitch-enhanced-broadcasting',
          destinations: [destination('twitch')],
        },
        type,
        allowProbes,
      ),
    ];
  } else if (!dualOutputMode) {
    legs = [
      completeLeg(
        {
          legId: 'horizontal',
          display: 'horizontal',
          outputKind:
            type === 'enhanced-broadcasting' ? 'twitch-enhanced-broadcasting' : 'standard',
          destinations: allDestinations,
        },
        type,
        allowProbes,
      ),
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
      .map(display =>
        completeLeg(
          {
            legId: display,
            display,
            outputKind:
              type === 'enhanced-broadcasting' ? 'twitch-enhanced-broadcasting' : 'standard',
            destinations: byDisplay[display],
          },
          type,
          allowProbes,
        ),
      );
  }

  // Invalid/empty destination states are rejected by Go Live validation. Keep
  // the classifier total so capability checks and tests never need to handle an
  // undefined topology.
  if (!legs.length) {
    legs = [
      completeLeg(
        {
          legId: 'horizontal',
          display: 'horizontal',
          outputKind: 'standard',
          destinations: [],
        },
        type,
        false,
      ),
    ];
  }

  return {
    type,
    legs,
    probeCandidates: legs.reduce<IAutoOptimizerProbeCandidate[]>(
      (candidates, leg) => candidates.concat(leg.probeCandidates),
      [],
    ),
  };
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

  const topology = classifyAutoOptimizerTopology(settings, dualOutputMode, twitchDualStreamAccess);
  if (profile.topology !== topology.type || profile.legs.length !== topology.legs.length) {
    return false;
  }

  return topology.legs.every(topologyLeg => {
    const profileLeg = profile.legs.find(leg => leg.legId === topologyLeg.legId);
    if (
      !profileLeg ||
      profileLeg.display !== topologyLeg.display ||
      profileLeg.outputKind !== topologyLeg.outputKind
    ) {
      return false;
    }

    const topologyDestinations = topologyLeg.destinations
      .map(destination => destination.platform)
      .sort();
    const profileDestinations = profileLeg.destinations
      .map(destination => destination.platform)
      .sort();

    return (
      topologyDestinations.length === profileDestinations.length &&
      topologyDestinations.every((destination, index) => destination === profileDestinations[index])
    );
  });
}
