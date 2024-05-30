<template>
  <div class="performance-metrics flex flex--center">
    <span class="performance-metric-wrapper">
      <img class="performance-metric-icon" src="../../media/images/icons/dropped-frames.png" />
      <span class="performance-metric">
        <span class="performance-metric__value">{{ droppedFrames }} ({{ percentDropped }}%)</span>
        DF
      </span>
    </span>

    <span class="performance-metric-wrapper">
      <img class="performance-metric-icon" src="../../media/images/icons/speed.png" />
      <span class="performance-metric">
        <span class="performance-metric__value">{{ bandwidth }}</span> kb/s
      </span>
    </span>
  </div>
</template>

<script lang="ts" src="./PerformanceMetricsStream.vue.ts"></script>
