<template>
  <div class="performance-metrics flex flex--center">
    <span class="performance-metric-wrapper">
      <img class="performance-metric-icon" src="../../media/images/icons/cpu.png" />
      <span class="performance-metric">
        <span class="performance-metric__value">{{ cpuPercent }}%</span> {{ $t('common.cpu') }}
      </span>
    </span>

    <span class="performance-metric-wrapper">
      <img class="performance-metric-icon" src="../../media/images/icons/fps.png" />
      <span class="performance-metric">
        <span class="performance-metric__value">{{ frameRate }}</span> FPS
      </span>
    </span>
  </div>
</template>

<script lang="ts" src="./PerformanceMetricsSoftware.vue.ts"></script>
