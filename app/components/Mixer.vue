<template>
  <div @contextmenu="handleRightClick" data-test="Mixer">
    <div class="studio-controls-top" v-if="!isCompactMode">
      <h4 class="studio-controls__label" v-tooltip.bottom="mixerTooltip">
        {{ $t('audio.mixer') }}
      </h4>
      <div class="studio-controls-top-sidebar">
        <i
          class="icon-settings icon-btn"
          @click="showAdvancedSettings()"
          v-tooltip.bottom="advancedSettingsTooltip"
        />
      </div>
    </div>
    <div class="studio-controls-selector mixer-panel">
      <MixerItem
        v-for="audioSource in audioSources"
        :audioSource="audioSource"
        :key="audioSource.sourceId"
      />
    </div>
  </div>
</template>

<script lang="ts" src="./Mixer.vue.ts"></script>
