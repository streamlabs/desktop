<template>
  <button
    class="button button--go-live"
    :class="{ 'button--soft-warning': isStreaming, 'is-compactMode': isCompactMode }"
    :disabled="isDisabled"
    @click="toggleStreaming"
    v-tooltip.left="isStreaming ? endStreamTooltip : goLiveTooltip"
    data-test="StartStreamingButton"
    :data-test-status="streamingStatus"
  >
    <StartStreamingIcon v-if="isStreaming" />
    <i v-if="!isStreaming" class="icon-live" />
    <span class="button-label" v-if="!isCompactMode">{{ getStreamButtonLabel() }}</span>
  </button>
</template>

<script lang="ts" src="./StartStreamingButton.vue.ts"></script>

<style lang="less" scoped>
@import url('../styles/index');

.button--go-live {
  min-width: 120px;
  font-size: @font-size4;

  &.is-compactMode {
    min-width: 56px;
  }

  i {
    margin: 0;
    font-size: @font-size6;
  }

  .button-label {
    margin-left: 8px;
    font-size: @font-size4;
  }
}

/deep/ .svg-live {
  width: 18px;
  height: 18px;
  vertical-align: middle;
  fill: var(--color-text-light);
}
</style>
