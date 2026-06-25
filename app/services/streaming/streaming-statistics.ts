export type TStreamingPerformanceStatsDisplay = 'horizontal' | 'vertical';

export interface IStreamingPerformanceDisplayStats {
  kbitsPerSec: number;
  dataOutput: number;
}

export type TStreamingPerformanceDisplayStatsByDisplay = Record<
  TStreamingPerformanceStatsDisplay,
  IStreamingPerformanceDisplayStats
>;

export interface IStreamingPerformanceStatsInstance {
  display?: TStreamingPerformanceStatsDisplay;
  displayStats?: TStreamingPerformanceDisplayStatsByDisplay;
  droppedFrames: number;
  totalFrames: number;
  kbitsPerSec: number;
  dataOutput: number;
}

export interface IStreamingPerformanceStats {
  droppedFrames: number;
  totalFrames: number;
  kbitsPerSec: number;
  dataOutput: number;
  byDisplay?: TStreamingPerformanceDisplayStatsByDisplay;
}

export interface IStreamingPerformanceStatsOptions {
  calculateByDisplay?: boolean;
}

export function createEmptyDisplayStats(): TStreamingPerformanceDisplayStatsByDisplay {
  return {
    horizontal: { kbitsPerSec: 0, dataOutput: 0 },
    vertical: { kbitsPerSec: 0, dataOutput: 0 },
  };
}

function addDisplayStats(
  target: TStreamingPerformanceDisplayStatsByDisplay,
  display: TStreamingPerformanceStatsDisplay,
  stats: IStreamingPerformanceDisplayStats,
) {
  target[display].kbitsPerSec += stats.kbitsPerSec;
  target[display].dataOutput += stats.dataOutput;
}

export function calculateStreamingPerformanceStats(
  instances: IStreamingPerformanceStatsInstance[],
  options: IStreamingPerformanceStatsOptions = {},
): IStreamingPerformanceStats {
  let droppedFrames = 0;
  let totalFrames = 0;
  let kbitsPerSec = 0;
  let dataOutput = 0;
  const byDisplay = options.calculateByDisplay ? createEmptyDisplayStats() : undefined;

  instances.forEach(instance => {
    droppedFrames += instance.droppedFrames;
    totalFrames += instance.totalFrames;
    kbitsPerSec += instance.kbitsPerSec;
    dataOutput += instance.dataOutput;

    if (byDisplay && instance.displayStats) {
      addDisplayStats(byDisplay, 'horizontal', instance.displayStats.horizontal);
      addDisplayStats(byDisplay, 'vertical', instance.displayStats.vertical);
    } else if (byDisplay && instance.display) {
      addDisplayStats(byDisplay, instance.display, {
        kbitsPerSec: instance.kbitsPerSec,
        dataOutput: instance.dataOutput,
      });
    }
  });

  if (instances.length > 1) {
    kbitsPerSec = Math.round(kbitsPerSec / instances.length);
  }

  return {
    droppedFrames,
    totalFrames,
    kbitsPerSec,
    dataOutput,
    ...(byDisplay ? { byDisplay } : {}),
  };
}
