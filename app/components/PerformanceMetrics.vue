<template>
  <div class="performance-metrics flex">
    <span class="performance-metric-wrapper resolution" v-if="!isCompactMode">
      <i class="performance-metric-icon icon-display" />
      <span class="performance-metric">
        <span class="performance-metric__value">{{ outputResolution }}</span>
      </span>
    </span>

    <span class="performance-metric-wrapper cpu_percent">
      <i class="performance-metric-icon icon-cpu" />
      <span class="performance-metric">
        <span class="performance-metric__value">{{ $t('common.cpu') }}{{ cpuPercent }}%</span>
      </span>
    </span>

    <span class="performance-metric-wrapper band_width">
      <i class="performance-metric-icon icon-kbps" />
      <i class="icon-warning-circle" v-if="bandwidthAlert" />
      <span class="performance-metric">
        <span class="performance-metric__value">{{ bandwidth }}</span> kbps
      </span>
    </span>

    <span class="performance-metric-wrapper frame_rate">
      <i class="performance-metric-icon icon-fps" />
      <span class="performance-metric">
        <span class="performance-metric__value">{{ frameRate }}</span
        >&#47;<span class="performance-metric__value">{{ targetFrameRate }}FPS</span>
      </span>
    </span>

    <span class="performance-metric-wrapper dropped_frames" v-if="!isCompactMode">
      <i class="performance-metric-icon icon-drop-fps" />
      <span class="performance-metric">
        <span class="performance-metric__value"
          >{{ $t('common.droppedFrames') }}{{ droppedFrames }} ({{ percentDropped }}%)</span
        >
      </span>
    </span>
  </div>
</template>

<script lang="ts" src="./PerformanceMetrics.vue.ts"></script>

<style lang="less" scoped>
@import url('../styles/index');

.performance-metrics {
  flex-wrap: wrap;

  .performance-metric-wrapper {
    &:first-child {
      &::before {
        padding-right: 0;
        content: '';
      }
    }
  }
}

.performance-metric-wrapper {
  position: relative;
  padding-right: 16px;
  white-space: nowrap;

  &.band_width {
    .icon-warning-circle {
      top: 4px;
      left: 12px;
      font-size: @font-size2;
    }
  }
}

.performance-metric {
  vertical-align: middle;
}

.performance-metric-icon {
  width: auto;
  margin-right: 8px;
  font-size: @font-size4;
  color: var(--color-text-dark);
  vertical-align: middle;
}

.performance-metric__value {
  font-size: @font-size2;
  color: var(--color-text);
}

.icon-warning-circle {
  position: absolute;
  width: 16px;
  height: 16px;
  color: var(--color-yellow);

  &::before,
  &::after {
    position: absolute;
    top: 0;
    top: 50%;
    left: 0;
    left: 50%;
    transform: translate(-50%, -50%);
  }

  &::before {
    z-index: @z-index-expand-content;
  }

  &::after {
    width: 16px;
    height: 16px;
    content: '';
    background-color: var(--color-bg-primary);
    border-radius: 50%;
  }
}
</style>
