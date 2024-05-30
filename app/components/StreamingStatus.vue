<template>
  <div>
    <div :class="{ 'streaming-status-pulse': true, 'streaming-status-offline': !isStreaming }" />
    <span class="streaming-status-text">
      {{ liveText }}
    </span>
  </div>
</template>

<script lang="ts" src="./StreamingStatus.vue.ts"></script>

<style lang="less" scoped>
@import url('../styles/index');

.streaming-status-text {
  margin: 0 2px 0 4px;
  .semibold;

  color: @white;
}

.streaming-status-pulse {
  width: 10px;
  height: 10px;
  margin: 0 6px;
  background: @red;
  border-radius: 50%;
  box-shadow: 0 0 0 rgba(252, 62, 63, 40%);

  &.streaming-status-offline {
    background: @grey;
    animation: none;
  }
}
</style>
