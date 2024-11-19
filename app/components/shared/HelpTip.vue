<template>
  <div class="help-tip" v-if="shouldShow && !isCompactMode" :data-mode="mode">
    <div class="help-tip__arrow"></div>
    <i @click.stop="closeHelpTip" class="help-tip__close icon-close" />
    <div class="help-tip__title">
      <i class="icon-notification" />
      <slot name="title"></slot>
    </div>
    <div class="help-tip__body"><slot name="content"></slot></div>
  </div>
</template>

<script lang="ts" src="./HelpTip.vue.ts"></script>

<style lang="less" scoped>
@import url('../../styles/index');

.help-tip {
  position: absolute;
  z-index: 100000;
  width: 240px;
  padding: 8px;
  font-size: 14px;
  color: @hover;
  white-space: initial;
  background: @text-primary;
  .radius;

  &[data-mode='scene-selector'] {
    top: -8px;
    left: 90px;
  }

  &[data-mode='login'] {
    bottom: 2px;
    left: 44px;
  }

  &[data-mode='streaming'] {
    top: -100px;
    right: 0;
  }
}

.help-tip__arrow {
  position: absolute;
  left: -8px;
  width: 0;
  height: 0;
  border-color: transparent @text-primary transparent transparent;
  border-style: solid;
  border-width: 8px 8px 8px 0;

  .help-tip[data-mode='scene-selector'] & {
    top: 8px;
  }

  .help-tip[data-mode='login'] & {
    bottom: 8px;
  }
}

.help-tip__close {
  position: absolute;
  right: 10px;
  font-size: 20px;
  cursor: pointer;
  opacity: 0.6;
  .transition();

  &:hover {
    opacity: 1;
  }
}

.help-tip__title {
  .semibold;

  display: flex;
  align-items: center;
  padding-bottom: 4px;
  margin-bottom: 4px;
  font-size: 16px;
  border-bottom: 1px solid @hover;

  i {
    margin-right: 8px;
    font-size: 16px;
  }
}
</style>
