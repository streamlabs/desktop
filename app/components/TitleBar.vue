<template>
  <div class="titlebar" :class="{ isUnstable }">
    <div class="titlebar-title">
      {{ title }}
    </div>
    <div class="titlebar-actions">
      <i v-if="isMinimizable" class="link icon-minimize titlebar-action" @click="minimize" />
      <i class="link icon-maximize titlebar-action" @click="maximize" v-if="!isCompactMode" />
      <i class="link icon-close-square titlebar-action" data-test="titlebar-close" @click="close" />
    </div>
  </div>
</template>

<script lang="ts" src="./TitleBar.vue.ts"></script>

<style lang="less" scoped>
@import url('../styles/index');

.titlebar {
  .dividing-border(bottom);

  z-index: 1;
  display: flex;
  align-items: center;
  height: @titlebar-height;
  background-color: var(--color-titlebar);
}

.titlebar-icon {
  .padding-left();

  height: 20px;
}

.titlebar-title {
  .padding-left();

  flex-grow: 1;
  -webkit-app-region: drag;
  color: var(--color-titlebar-text);
}

.live-status {
  display: inline-block;
  height: 12px;
  animation: live-shadow 3s infinite;

  rect {
    animation: live-color 3s infinite;
  }
}

@keyframes live-color {
  0% {
    fill: @red;
  }

  50% {
    fill: #a50000;
  }

  100% {
    fill: @red;
  }
}

@keyframes live-shadow {
  0% {
    box-shadow: 0 0 3px 3px rgba(255, 0, 0, 40%);
  }

  50% {
    box-shadow: 0 0 0 0 rgba(255, 0, 0, 0%);
  }

  100% {
    box-shadow: 0 0 3px 3px rgba(255, 0, 0, 40%);
  }
}

.titlebar-actions {
  -webkit-app-region: no-drag;
  height: 16px;
}

.titlebar-action {
  .margin-right();

  display: inline-block;
  font-size: @font-size4;
  color: var(--color-titlebar-action);
  cursor: pointer;

  &:not(:disabled):hover {
    color: var(--color-titlebar-action-hover);
  }
}
</style>
