<template>
  <div id="mainWrapper" class="modal-layout" data-test="ModalLayout">
    <div class="ModalLayout-fixed" :style="fixedStyle">
      <slot name="fixed" />
    </div>
    <div class="modal-layout-content" :class="{ bareContent, noScroll }">
      <slot name="content" v-if="!loading" />
      <div class="spinner-container" v-else>
        <i class="icon-spinner icon-spin modal-layout-spinner" />
      </div>
    </div>
    <div v-if="showControls" class="modal-layout-controls">
      <button v-if="showCancel" class="button button--secondary" @click="cancel" data-test="Cancel">
        {{ $t('common.cancel') }}
      </button>
      <button class="button button--primary" @click="done" data-test="Done">
        {{ $t('common.done') }}
      </button>
    </div>
    <div v-if="customControls" class="modal-layout-controls">
      <slot name="controls" />
    </div>
  </div>
</template>

<script lang="ts" src="./ModalLayout.vue.ts"></script>

<style lang="less" scoped>
@import url('../styles/index');

.modal-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--color-bg-quinary);
}

.ModalLayout-fixed {
  z-index: 1;
  flex-shrink: 0;
}

.modal-layout-content {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  height: 100%;
  padding: 16px;
  overflow-x: hidden;
  overflow-y: auto;

  &.bareContent {
    padding: 0;
  }

  &.noScroll {
    overflow-y: hidden;
  }
}

.spinner-container {
  position: absolute;
  top: 50%;
  left: 50%;
  width: auto;
  transform: translate(-50%, -50%);
}

.modal-layout-spinner {
  display: inline-block;
  height: 36px;
  font-size: 36px;
}

.modal-layout-controls {
  .dividing-border(top);

  z-index: @z-index-default-content;
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: flex-end;
  text-align: right;
  background-color: var(--color-bg-primary);

  div {
    display: flex;
    justify-content: flex-end;
  }

  &:not(:empty) {
    padding: 16px;
  }

  .button {
    margin-left: 12px;
  }
}

.icon-spin {
  animation: icon-spin 2s infinite linear;
}

@keyframes icon-spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(359deg);
  }
}
</style>
