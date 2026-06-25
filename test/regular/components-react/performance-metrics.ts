import test from 'ava';
import * as Module from 'module';

const moduleLoader = Module as any;
const originalLoad = moduleLoader._load;

moduleLoader._load = function (this: unknown, request: string, ...args: unknown[]) {
  if (request === 'services/i18n') return { $t: (key: string) => key };
  return originalLoad.call(this, request, ...args);
};

const { getPerformanceMetricMetadata } = require('../../../app/components-react/shared/performance-metrics') as typeof import('../../../app/components-react/shared/performance-metrics');

moduleLoader._load = originalLoad;

test('Performance metric metadata uses one combined bandwidth metric outside dual output mode', t => {
  const metrics = getPerformanceMetricMetadata({
    cpuPercent: '8.1',
    frameRate: '30.00',
    droppedFrames: 124,
    percentDropped: '1.9',
    bandwidth: '8290',
    bandwidthByDisplay: { horizontal: '5000', vertical: '3290' },
    isDualOutputMode: false,
  });

  t.deepEqual(
    metrics.filter(metric => metric.attribute === 'bandwidth'),
    [{ key: 'bandwidth', attribute: 'bandwidth', value: '8290', label: 'kb/s', icon: 'icon-bitrate' }],
  );
});

test('Performance metric metadata shows horizontal and vertical bandwidth in dual output mode', t => {
  const metrics = getPerformanceMetricMetadata({
    cpuPercent: '8.1',
    frameRate: '30.00',
    droppedFrames: 124,
    percentDropped: '1.9',
    bandwidth: '8290',
    bandwidthByDisplay: { horizontal: '5000', vertical: '3290' },
    isDualOutputMode: true,
  });

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
