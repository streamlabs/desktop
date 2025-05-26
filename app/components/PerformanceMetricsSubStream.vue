<template>
  <div class="performance-metrics flex" v-if="use">
    <span class="performance-metric-wrapper resolution">
      <i class="performance-metric-icon icon-output" />
      <span class="performance-metric">
        <span class="performance-metric__value">サブ配信:{{ message }}</span>
      </span>
    </span>
  </div>
</template>

<script lang="ts" src="./PerformanceMetricsSubStream.vue.ts"></script>

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
