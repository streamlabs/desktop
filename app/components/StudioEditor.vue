<template>
  <div
    class="studio-editor-display-container noselect"
    ref="display"
    @mousedown="handleMouseDown"
    @mouseup="handleMouseUp"
    @mousemove="handleMouseMove"
    @mouseenter="handleMouseEnter"
    @dblclick="handleMouseDblClick"
  >
    <display
      class="studio-editor-display"
      :drawUI="true"
      :paddingSize="10"
      :sourceId="studioMode ? getStudioTransitionName() : void 0"
      @outputResize="onOutputResize"
    />
  </div>
</template>

<script lang="ts" src="./StudioEditor.vue.ts"></script>

<style lang="less" scoped>
@import url('../styles/index');

.studio-editor-display-container {
  position: relative;
  flex-grow: 1;
  background-color: @bg-tertiary;
}

.studio-editor-display {
  position: absolute;
  width: 100%;
  height: 100%;
}
</style>
