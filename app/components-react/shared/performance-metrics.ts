import { IPinnedStatistics } from 'services/customization';

export interface IPerformanceMetricValues {
  cpuPercent: string;
  frameRate: string;
  droppedFrames: number;
  percentDropped: string;
  bandwidth: string;
  bandwidthByDisplay: {
    horizontal: string;
    vertical: string;
  };
  isDualOutputMode: boolean;
}

export interface IPerformanceMetricMetadata {
  key: string;
  attribute: keyof IPinnedStatistics;
  value: string | number;
  label: string;
  icon: string;
}

type TTranslate = (key: string, params?: Record<string, unknown>) => string;

export function getPerformanceMetricMetadata(
  values: IPerformanceMetricValues,
  translate: TTranslate,
): IPerformanceMetricMetadata[] {
  const metrics: IPerformanceMetricMetadata[] = [
    {
      key: 'cpu',
      attribute: 'cpu',
      value: `${values.cpuPercent}%`,
      label: translate('CPU'),
      icon: 'icon-cpu',
    },
    {
      key: 'fps',
      attribute: 'fps',
      value: values.frameRate,
      label: 'FPS',
      icon: 'icon-fps',
    },
    {
      key: 'droppedFrames',
      attribute: 'droppedFrames',
      value: `${values.droppedFrames} (${values.percentDropped}%)`,
      label: translate('Dropped Frames'),
      icon: 'icon-dropped-frames',
    },
  ];

  if (values.isDualOutputMode) {
    metrics.push({
      key: 'bandwidth',
      attribute: 'bandwidth',
      value: `H: ${values.bandwidthByDisplay.horizontal} V: ${values.bandwidthByDisplay.vertical}`,
      label: 'kb/s',
      icon: 'icon-bitrate',
    });
  } else {
    metrics.push({
      key: 'bandwidth',
      attribute: 'bandwidth',
      value: values.bandwidth,
      label: 'kb/s',
      icon: 'icon-bitrate',
    });
  }

  return metrics;
}
