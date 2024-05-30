<template>
  <div style="height: 100%">
    <title-bar :title="options.title" class="child-window-titlebar" />
    <div class="blank-slate">
      <div class="spinner-spacer" />
      <i class="fa fa-spinner fa-pulse" />
      <div class="spinner-spacer" />
    </div>
    <div class="child-window-content">
      <component
        v-for="(component, index) in components"
        :key="`${component.name}-${index}`"
        v-if="component.name"
        v-show="component.isShown"
        :is="component.name"
      />
    </div>
  </div>
</template>

<script lang="ts" src="./ChildWindow.vue.ts"></script>

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
  display: flex;
  flex-direction: column;
  height: calc(100% - @titlebar-height); // TitleBarぶんの高さを引く
}

.spinner-spacer {
  flex-grow: 1;
}
</style>
