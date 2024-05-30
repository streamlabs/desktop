<template>
  <div style="height: 100%">
    <title-bar :title="options.title" class="child-window-titlebar" v-if="!options.isFullScreen" />
    <div
      :class="['blank-slate', { 'no-titlebar': options.isFullScreen }]"
      v-if="!options.hideBlankSlate"
    >
      <div class="spinner-spacer" />
      <i class="icon-spinner icon-spin modal-layout-spinner" />
      <div class="spinner-spacer" />
    </div>
    <div :class="['child-window-content', { 'no-titlebar': options.isFullScreen }]">
      <component :is="options.componentName" />
    </div>
  </div>
</template>

<script lang="ts" src="./OneOffWindow.vue.ts"></script>

<style lang="less" scoped>
@import url('../../styles/index');

.blank-slate {
  position: absolute;
  z-index: -1;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: calc(100% - @titlebar-height); // TitleBarぶんの高さを引く
  font-size: 24px;
  text-align: center;
  background-color: @bg-primary;
}

.child-window-titlebar {
  flex-shrink: 0;
}

.child-window-content {
  height: calc(100% - @titlebar-height); // TitleBarぶんの高さを引く
}

.no-titlebar {
  height: 100%;
}

.spinner-spacer {
  flex-grow: 1;
}
</style>
