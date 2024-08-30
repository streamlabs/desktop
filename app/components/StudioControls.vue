<template>
  <div class="studio-controls row expanded" :class="{ opened: opened || isCompactMode }">
    <button
      @click="onToggleControls"
      class="studio-controls-toggle-button"
      :class="{ 'studio-controls--opened': opened }"
      v-if="!isCompactMode"
    >
      <i class="icon-drop-down-arrow"></i>
    </button>
    <template v-if="isCompactMode">
      <div class="studio-controls-compact">
        <div class="studio-controls-tabs">
          <a
            @click="compactModeStudioController = 'mixer'"
            class="studio-controls-tab button--tab"
            :class="{ active: compactModeStudioController === 'mixer' }"
            >ミキサー</a
          >
          <a
            @click="compactModeStudioController = 'scenes'"
            class="studio-controls-tab button--tab"
            :class="{ active: compactModeStudioController === 'scenes' }"
            >{{ activeCollection.name }}</a
          >
        </div>
        <scene-selector
          class="studio-controls-panel"
          v-if="compactModeStudioController === 'scenes'"
        />
        <mixer class="studio-controls-panel" v-if="compactModeStudioController === 'mixer'" />
      </div>
    </template>
    <template v-else-if="opened">
      <scene-selector class="studio-controls-panel small-4 columns" />
      <source-selector class="studio-controls-panel small-4 columns" />
      <mixer class="studio-controls-panel small-4 columns" />
    </template>
  </div>
</template>

<script lang="ts" src="./StudioControls.vue.ts"></script>

<style lang="less" scoped>
@import url('../styles/index');

.studio-controls {
  .dividing-border;

  position: relative;
  width: 100%;
  height: 0;
  padding: @toggle-button-size 8px 0 8px;
  background-color: var(--color-bg-quinary);

  &.opened {
    height: @studio-controls-opened-height;
    padding-bottom: 16px;
  }

  .isCompactMode & {
    display: flex;
    width: @nicolive-area-width;
    padding-top: 0;
  }
}

.studio-controls-toggle-button {
  position: absolute;
  right: 0;
  left: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 180px;
  height: @toggle-button-size;
  margin: -@toggle-button-size auto 0 auto;

  > i {
    .icon-hover;

    display: block;
    font-size: @font-size2;
    color: var(--color-text);
    transform: rotate(-180deg);
  }

  .opened & {
    i {
      transform: rotate(0deg);
    }
  }
}
</style>

<style lang="less">
@import url('../styles/index');

.studio-controls-panel {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  height: 100%;
  min-height: 0;
  padding: 0 8px;
}

.studio-controls-compact {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  .text-ellipsis;
}

.studio-controls-tabs {
  display: flex;
  height: 48px;
  padding: 0 8px;
}

.studio-controls-tab {
  .text-ellipsis;

  display: block;
  flex: 1 0 50%;
  line-height: 32px;
  text-decoration: none;
}

.studio-controls-top {
  display: flex;
  flex: 0 0 16px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  height: 16px;
  margin-bottom: 12px;
}

.studio-controls__label {
  margin-bottom: 0;
  font-size: @font-size4;
  color: var(--color-text-light);
  .semibold;
}

.studio-controls-selector {
  flex-grow: 1;
  overflow-y: auto;
  background: var(--color-bg-tertiary);
  .radius;
}
</style>
