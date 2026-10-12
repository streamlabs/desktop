<template>
  <div class="modal-layout modal-layout-vue" :class="wrapperClassNames">
    <div class="ModalLayout-fixed" :style="fixedStyle"><slot name="fixed" /></div>
    <scrollable
      :className="containsTabs ? 'modal-layout-tab-content' : 'modal-layout-content'"
      :style="contentStyle"
    >
      <slot name="content" v-if="!loading" />
      <div class="spinner-container" v-else>
        <i class="fa fa-spinner fa-pulse modal-layout-spinner" />
      </div>
    </scrollable>
    <div v-if="showControls" class="modal-layout-controls">
      <button v-if="showCancel" class="button button--default" @click="cancel">
        {{ $t('Cancel') }}
      </button>
      <button v-if="showDone" :disabled="disableDone" class="button button--action" @click="done">
        {{ $t('Done') }}
      </button>
    </div>
    <div v-if="customControls" class="modal-layout-controls"><slot name="controls" /></div>
  </div>
</template>

<script lang="ts" src="./ModalLayout.vue.ts"></script>

<style lang="less" scoped>
@import '../styles/index';

.modal-layout {
  height: 100%;
  display: flex;
  flex-direction: column;
  color: var(--paragraph);
  background-color: var(--background);
}

.modal-layout.has-titlebar {
  // Compensate for titlebar living in ChildWindow
  height: calc(~'100% - @{titlebar-height}');

  &.modal-layout-mac {
    height: calc(~'100% - @{titlebar-height-mac}');
  }
}

.modal-layout--w-side-menu {
  .modal-layout-content {
    overflow-y: hidden;
  }
}

.ModalLayout-fixed {
  flex-shrink: 0;
  z-index: 1;
}

.modal-layout-content {
  .padding(2);

  flex-grow: 1;
  height: 100%;
  display: flex;
  position: relative;
  overflow-x: hidden;

  & > * {
    width: 100%;
  }
}

.modal-layout-tab-content {
  flex-grow: 1;
  height: 100%;
  display: flex;
  position: relative;
  overflow-x: hidden;
  margin-top: 45px;

  & > * {
    width: 100%;
  }
}

.spinner-container {
  position: absolute;
  width: auto;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.modal-layout-spinner {
  font-size: 36px;
  display: inline-block;
  height: 36px;
}

.modal-layout-controls {
  .padding-v-sides();
  .padding-h-sides(2);
  .text-align(@right);

  background-color: var(--section);
  flex-shrink: 0;
  z-index: 10;

  .button {
    .margin-left();
  }
}
</style>
