<template>
  <div class="help-tip" v-if="shouldShow && !isCompactMode" :data-mode="mode">
    <div class="help-tip__arrow"></div>
    <div class="help-tip__inner">
      <div class="help-tip__title">
        <slot name="title"></slot>
      </div>
      <div class="help-tip__body"><slot name="content"></slot></div>
    </div>
    <div @click.stop="closeHelpTip" class="help-tip__close">
      <i class="icon-close" />
    </div>
  </div>
</template>

<script lang="ts" src="./HelpTip.vue.ts"></script>

<style lang="less" scoped>
@import url('../../styles/index');

.help-tip {
  position: absolute;
  z-index: 100000;
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 220px;
  padding: 8px;
  font-size: 14px;
  color: var(--color-surface-inverse);
  white-space: initial;
  background-color: currentcolor;
  .radius;

  &[data-mode='scene-selector'] {
    top: -8px;
    left: 96px;
    max-width: 300px;
  }

  &[data-mode='login'] {
    bottom: 2px;
    left: 44px;
  }

  &[data-mode='streaming'] {
    right: -12px;
    bottom: 62px;
    max-width: 260px;
    color: var(--color-surface-accent-primary-light);
  }
}

.help-tip__arrow {
  position: absolute;
  left: -8px;
  width: 0;
  height: 0;
  border-color: transparent currentcolor transparent transparent;
  border-style: solid;
  border-width: 8px 8px 8px 0;

  .help-tip[data-mode='scene-selector'] & {
    top: 32px;
  }

  .help-tip[data-mode='login'] & {
    bottom: 8px;
  }

  .help-tip[data-mode='streaming'] & {
    bottom: -12px;
    left: 170px;
    transform: rotate(-90deg);
  }
}

.help-tip__close {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: var(--color-object-emphasis-inverse);
  cursor: pointer;
  opacity: 0.6;
  .transition();

  i {
    margin: 0;
    font-size: var(--font-size-xs);
  }

  &:hover {
    opacity: 1;
  }
}

.help-tip__inner {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  color: var(--color-object-emphasis-inverse);
}

.help-tip__title {
  display: flex;
  align-items: center;
  margin-bottom: 4px;
  font-size: var(--font-size-sm);
  font-weight: bold;
  line-height: var(--line-height-sm);
  text-align: left;
}

.help-tip__body {
  font-size: var(--font-size-xs);
  line-height: var(--line-height-md);
  text-align: left;
}
</style>
