<template>
<div class="resize-bar" :class="{
 top: position === 'top',
 right: position === 'right',
 left: position === 'left',
 active: active
 }"
 :style="{transform: transform}"
 @mousedown="onMouseDownHandler"
>
  <div class="resize-line" />
</div>
</template>

<script lang="ts" src="./ResizeBar.vue.ts"></script>

<style lang="less">
@import "../../styles/index";

.resize-bar {
  position: relative;
  z-index: 1001;
  background-color: rgba(50, 50, 50, 0);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;

  &.top {
    height: 10px;
    border-top: 1px solid var(--border);
    cursor: row-resize;

    .resize-line {
      height: 4px;
      width: 25px;
    }
  }

  &.right {
    width: 10px;
    cursor: col-resize;

    .resize-line {
      height: 25px;
      width: 4px;
    }
  }

  &.left {
    width: 10px;
    cursor: col-resize;

    .resize-line {
      height: 25px;
      width: 4px;
    }
  }

  &.active {
    background-color: rgba(50, 50, 50, 0.5);
    cursor: default;
  }

  &:hover {
    .resize-line {
      background-color: var(--title);
    }
  }
}

.resize-line {
  .center();
  .radius(0.5);

  background-color: var(--paragraph);
}
</style>
