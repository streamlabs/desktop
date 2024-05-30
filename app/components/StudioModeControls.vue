<template>
  <div class="studio-mode-controls" :class="{ stacked }">
    <span class="studio-mode-control">
      {{ $t('common.studioModeButtons.preview') }}
    </span>
    <button class="button button--secondary button--semi-opac" @click="studioModeTransition">
      {{ $t('common.studioModeButtons.transition') }}
      <i class="icon-arrow rotate-r90" v-if="stacked" />
      <i class="icon-arrow" v-else />
    </button>
    <span class="studio-mode-control">
      {{ $t('common.studioModeButtons.live') }}
    </span>
  </div>
</template>

<script lang="ts" src="./StudioModeControls.vue.ts"></script>

<style lang="less" scoped>
@import url('../styles/index');

.studio-mode-controls {
  display: flex;
  align-items: center;
  padding-top: 16px;
  color: var(--color-text-light);

  &.stacked {
    flex-direction: column;
    height: initial;
    padding: 0 10px;
  }
}

.studio-mode-control {
  display: inline-flex;
  flex-grow: 1;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 700;
  text-align: center;
  letter-spacing: 0.8px;
}

.rotate-r90 {
  display: inline-block;
  transform: rotate(90deg);
}
</style>
