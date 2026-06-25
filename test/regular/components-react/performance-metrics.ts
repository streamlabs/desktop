import test from 'ava';
import { getPerformanceMetricMetadata } from '../../../app/components-react/shared/performance-metrics';

const translate = (key: string) => key;

test('performance metric metadata uses one combined bandwidth metric outside dual output mode', t => {
  const metrics = getPerformanceMetricMetadata(
    {
      cpuPercent: '8.1',
      frameRate: '30.00',
      droppedFrames: 124,
      percentDropped: '1.9',
      bandwidth: '8290',
      bandwidthByDisplay: { horizontal: '5000', vertical: '3290' },
      isDualOutputMode: false,
    },
    translate,
  );

  t.deepEqual(
    metrics.filter(metric => metric.attribute === 'bandwidth'),
    [{ key: 'bandwidth', attribute: 'bandwidth', value: '8290', label: 'kb/s', icon: 'icon-bitrate' }],
  );
});

test('performance metric metadata shows horizontal and vertical bandwidth in dual output mode', t => {
  const metrics = getPerformanceMetricMetadata(
    {
      cpuPercent: '8.1',
      frameRate: '30.00',
      droppedFrames: 124,
      percentDropped: '1.9',
      bandwidth: '8290',
      bandwidthByDisplay: { horizontal: '5000', vertical: '3290' },
      isDualOutputMode: true,
    },
    translate,
  );

  t.deepEqual(
    metrics.filter(metric => metric.attribute === 'bandwidth'),
    [
      {
        key: 'bandwidth',
        attribute: 'bandwidth',
        value: 'H: 5000 V: 3290',
        label: 'kb/s',
        icon: 'icon-bitrate',
      },
    ],
  );
});
