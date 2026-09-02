import { IGoLiveSettings } from 'services/streaming';
import { TPlatform } from 'services/platforms';
import {
  IAutoOptimizerDestination,
  IAutoOptimizerOutput,
  IAutoOptimizerProbeCandidate,
  IAutoOptimizerProfile,
  IAutoOptimizerStreamSetup,
  TAutoOptimizerPlatform,
  TAutoOptimizerProbeProvider,
  TAutoOptimizerStreamSetupType,
} from './types';

const supportedPlatforms: TAutoOptimizerPlatform[] = [
  'twitch',
  'youtube',
  'facebook',
  'kick',
  'tiktok',
  'custom',
];

export function normalizeAutoOptimizerPlatform(platform: string): TAutoOptimizerPlatform {
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
  return { platform: normalizeAutoOptimizerPlatform(platform) };
}

function getEstimateReason(type: TAutoOptimizerStreamSetupType): string {
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
  outputId: string,
  destinations: IAutoOptimizerDestination[],
  allowed: boolean,
  type: TAutoOptimizerStreamSetupType,
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
      return { probeId: `${outputId}-${provider}`, kind, outputId, provider };
    });
}

function completeOutput(
  output: Omit<IAutoOptimizerOutput, 'probeCandidates' | 'measurement' | 'estimateReason'>,
  type: TAutoOptimizerStreamSetupType,
  allowProbes: boolean,
): IAutoOptimizerOutput {
  const candidates = probeCandidates(output.outputId, output.destinations, allowProbes, type);
  return {
    ...output,
    probeCandidates: candidates,
    measurement: candidates.length ? 'active' : 'estimated',
    estimateReason: candidates.length ? undefined : getEstimateReason(type),
  };
}

/**
 * Describe the outputs that Desktop will actually create. The result contains
 * no provider credentials and is safe to construct in any renderer.
 */
export function describeAutoOptimizerStreamSetup(
  settings: IGoLiveSettings,
  dualOutputMode: boolean,
  twitchDualStreamAccess = false,
): IAutoOptimizerStreamSetup {
  const platforms = enabledPlatforms(settings);
  // `dualStream` custom entries duplicate platforms already listed in
  // `platforms`; ignore them so each real upload output is counted once.
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
  // Twitch Dual Stream uses one Enhanced Broadcasting connection carrying
  // paired horizontal and vertical video. Classify it as Enhanced Broadcasting
  // even when the persisted toggle is false.
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

  let type: TAutoOptimizerStreamSetupType;
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

  // Custom RTMP destinations and Stream Shift are never used for active
  // testing. Enhanced Broadcasting can run its workload test only for a
  // Twitch-only connection with either one horizontal video or paired
  // horizontal and vertical video.
  const enhancedBroadcastingProbeEligible =
    type === 'enhanced-broadcasting' &&
    !streamShift &&
    !hasCustom &&
    platforms.length === 1 &&
    platforms[0] === 'twitch' &&
    !twitchSettings?.useCustomFields &&
    (!dualOutputMode || isSingleConnectionTwitchDual);
  const enhancedBroadcastingDualOutputProbeEligible = type === 'enhanced-broadcasting-dual-output';
  const allowProbes =
    enhancedBroadcastingProbeEligible ||
    enhancedBroadcastingDualOutputProbeEligible ||
    !['custom-rtmp', 'mixed', 'enhanced-broadcasting', 'stream-shift'].includes(type);

  const allDestinations: IAutoOptimizerDestination[] = [
    ...platforms.map(destination),
    ...customDestinations.map(() => destination('custom')),
  ];

  let outputs: IAutoOptimizerOutput[];
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
    outputs = [
      completeOutput(
        {
          outputId: 'twitch-enhanced-broadcasting',
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
          completeOutput(
            {
              outputId: `${display}-standard`,
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
    outputs = [
      completeOutput(
        {
          outputId: 'twitch-dual',
          display: 'both',
          outputKind: 'twitch-enhanced-broadcasting',
          destinations: [destination('twitch')],
        },
        type,
        allowProbes,
      ),
    ];
  } else if (!dualOutputMode) {
    outputs = [
      completeOutput(
        {
          outputId: 'horizontal',
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

    outputs = (['horizontal', 'vertical'] as const)
      .filter(display => byDisplay[display].length > 0)
      .map(display =>
        completeOutput(
          {
            outputId: display,
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

  // Go Live validation rejects empty destination lists. Return a placeholder
  // horizontal output here so callers always receive a complete description.
  if (!outputs.length) {
    outputs = [
      completeOutput(
        {
          outputId: 'horizontal',
          display: 'horizontal',
          outputKind: 'standard',
          destinations: [],
        },
        type,
        false,
      ),
    ];
  }

  return { type, outputs };
}

/**
 * An optimizer profile remains valid only while the Go Live outputs and
 * destinations it was calculated for remain unchanged.
 */
export function isAutoOptimizerProfileCompatible(
  profile: IAutoOptimizerProfile,
  settings: IGoLiveSettings,
  dualOutputMode: boolean,
  twitchDualStreamAccess = false,
): boolean {
  if (profile.schemaVersion !== 1) return false;

  const streamSetup = describeAutoOptimizerStreamSetup(
    settings,
    dualOutputMode,
    twitchDualStreamAccess,
  );
  if (
    profile.streamSetup !== streamSetup.type ||
    profile.outputs.length !== streamSetup.outputs.length
  ) {
    return false;
  }

  return streamSetup.outputs.every(output => {
    const profileOutput = profile.outputs.find(item => item.outputId === output.outputId);
    if (
      !profileOutput ||
      profileOutput.display !== output.display ||
      profileOutput.outputKind !== output.outputKind
    ) {
      return false;
    }

    const outputDestinations = output.destinations.map(destination => destination.platform).sort();
    const profileDestinations = profileOutput.destinations
      .map(destination => destination.platform)
      .sort();

    return (
      outputDestinations.length === profileDestinations.length &&
      outputDestinations.every((destination, index) => destination === profileDestinations[index])
    );
  });
}
