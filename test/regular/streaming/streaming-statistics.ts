import test from 'ava';
import { calculateStreamingPerformanceStats } from '../../../app/services/streaming/streaming-statistics';

test('Streaming stats use the current live instance count for bitrate averaging', t => {
  const stats = calculateStreamingPerformanceStats([
    {
      droppedFrames: 0,
      totalFrames: 300,
      kbitsPerSec: 6000,
      dataOutput: 1024,
    },
  ]);

  t.is(stats.kbitsPerSec, 6000);
});

test('Streaming stats average bitrate across active regular streaming instances without display stats', t => {
  const stats = calculateStreamingPerformanceStats([
    {
      display: 'horizontal',
      droppedFrames: 1,
      totalFrames: 100,
      kbitsPerSec: 6000,
      dataOutput: 1024,
    },
    {
      display: 'vertical',
      droppedFrames: 2,
      totalFrames: 200,
      kbitsPerSec: 4000,
      dataOutput: 2048,
    },
  ]);

  t.deepEqual(stats, {
    droppedFrames: 3,
    totalFrames: 300,
    kbitsPerSec: 5000,
    dataOutput: 3072,
  });
});

test('Streaming stats keep enhanced broadcasting aggregate bitrate', t => {
  const stats = calculateStreamingPerformanceStats([
    {
      droppedFrames: 0,
      totalFrames: 300,
      kbitsPerSec: 13500,
      dataOutput: 1024,
    },
  ]);

  t.is(stats.kbitsPerSec, 13500);
});

test('Streaming stats report regular streaming bitrate by display', t => {
  const stats = calculateStreamingPerformanceStats(
    [
      {
        display: 'horizontal',
        droppedFrames: 1,
        totalFrames: 100,
        kbitsPerSec: 6000,
        dataOutput: 1024,
      },
      {
        display: 'vertical',
        droppedFrames: 2,
        totalFrames: 200,
        kbitsPerSec: 4000,
        dataOutput: 2048,
      },
    ],
    { calculateByDisplay: true },
  );

  t.deepEqual(stats.byDisplay, {
    horizontal: { kbitsPerSec: 6000, dataOutput: 1024 },
    vertical: { kbitsPerSec: 4000, dataOutput: 2048 },
  });
});

test('Streaming stats report enhanced broadcasting bitrate by display', t => {
  const stats = calculateStreamingPerformanceStats(
    [
      {
        droppedFrames: 0,
        totalFrames: 300,
        kbitsPerSec: 13500,
        dataOutput: 4096,
        displayStats: {
          horizontal: { kbitsPerSec: 5000, dataOutput: 1500 },
          vertical: { kbitsPerSec: 2500, dataOutput: 700 },
        },
      },
    ],
    { calculateByDisplay: true },
  );

  t.deepEqual(stats.byDisplay, {
    horizontal: { kbitsPerSec: 5000, dataOutput: 1500 },
    vertical: { kbitsPerSec: 2500, dataOutput: 700 },
  });
});
