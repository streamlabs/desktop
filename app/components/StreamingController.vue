<template>
  <div class="nav-container">
    <div class="nav-item elapsed-time">
      <time>{{ streamingElapsedTime }}</time>
    </div>
    <div class="nav-item">
      <button
        :disabled="locked"
        class="button--circle button--secondary record-button"
        @click="toggleRecording"
        :class="{ active: streamingService.isRecording }"
        v-tooltip.left="recordTooltip"
      >
        <span>{{ $t('streaming.recording') }}</span>
      </button>
    </div>

    <div
      class="nav-item replay-button-group"
      :class="{ 'is-replay-start': !replayBufferOffline }"
      v-if="replayBufferEnabled"
    >
      <button
        class="button--circle button--secondary button--replay-start"
        @click="toggleReplayBuffer"
        v-tooltip.left="startReplayBufferTooltip"
      >
        <i class="icon-replay-buffer-start" />
      </button>
      <button
        class="button--circle button--replay-stop"
        @click="toggleReplayBuffer"
        v-tooltip.left="stopReplayBufferTooltip"
      >
        <i class="icon-replay-buffer-stop" />
      </button>
      <button
        class="button--circle button--secondary button--replay-save"
        @click="saveReplay"
        :disabled="replayBufferSaving || replayBufferStopping"
        v-tooltip.left="saveReplayTooltip"
      >
        <i class="icon-replay-buffer-save" />
      </button>
    </div>

    <div class="nav-item">
      <start-streaming-button :disabled="locked" />
    </div>
  </div>
</template>

<script lang="ts" src="./StreamingController.vue.ts"></script>

<style lang="less" scoped>
@import url('../styles/index');

.nav-container {
  display: flex;
  align-items: center;
}

.nav-item {
  margin-left: 16px;
}

.error-wrapper {
  position: absolute;
  z-index: 2;
}

.platform-error {
  padding: 4px;
  background: var(--color-red-dark);
  border-radius: 3px;

  i {
    margin-left: 4px;
    color: @red;
  }

  span {
    padding-left: 5px;
    margin-right: 10px;
    color: @red;
  }

  .alert-button {
    height: 18px;
    padding: 0 8px;
    margin: 0 5px;
    font-size: 10px;
    line-height: 12px;
    background: var(--color-red-dark);
  }
}

.elapsed-time {
  .time-styling;

  margin-right: auto;
}

.record-button {
  .bold;

  letter-spacing: 0.2px;

  span {
    color: var(--color-button-label);
  }

  &.active {
    // animation: pulse 2.5s infinite;
    background: var(--color-red);
    opacity: 1;

    &:hover {
      background: var(--color-red-hover);
      opacity: 1;
    }
  }
}

.replay-button-group {
  position: relative;
  display: flex;
  width: @item-generic-size;
  height: @item-generic-size;
  overflow: hidden;
  border-radius: 16px;
  .transition;

  &.is-replay-start {
    width: @item-generic-size*2;
  }
}

.button--replay-start {
  position: absolute;
  top: 0;
  right: 0;

  .is-replay-start & {
    display: none;
  }
}

.button--replay-stop {
  position: absolute;
  top: 0;
  right: @item-generic-size;
  background: var(--color-red-dark);
  border-radius: 0;

  i {
    font-size: @font-size2;
    color: var(--color-red);
  }
}

.button--replay-save {
  position: absolute;
  top: 0;
  right: 0;
  display: none;
  border-radius: 0;

  .is-replay-start & {
    display: flex;
  }
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(252, 62, 63, 40%);
  }

  70% {
    box-shadow: 0 0 0 6px rgba(0, 0, 0, 0%);
  }

  100% {
    box-shadow: 0 0 0 0 rgba(0, 0, 0, 0%);
  }
}
</style>
