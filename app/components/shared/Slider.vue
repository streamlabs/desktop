<template>
  <div class="slider-container">
    <vue-slider
      class="slider"
      @input="value => updateValue(value)"
      :value="value"
      :disabled="disabled"
      :max="max"
      :min="min"
      :interval="interval"
      :speed="0"
      :height="4"
      :dotSize="dotSize"
      :tooltip="tooltip"
      tooltip-dir="bottom"
      :sliderStyle="sliderStyle"
      :formatter="formatter"
      ref="slider"
    />
    <input
      v-if="valueBox && !usePercentages"
      class="slider-input"
      type="text"
      :value="value"
      @change="updateValue(parseFloat($event.target.value))"
      @keydown="handleKeydown"
    />
  </div>
</template>

<script lang="ts" src="./Slider.vue.ts"></script>

<style lang="less">
@import url('../../styles/index');

.slider-container {
  display: flex;
  width: 100%;

  > .slider {
    width: 70% !important;
  }

  > .controls {
    width: 29.9% !important;
  }
}

.slider-input {
  width: 60px;
  margin-left: 10px;
}

.slider {
  flex-grow: 1;
  height: auto;
  padding: 8px 0 !important;
  margin: 0;
  background: transparent;
}

.vue-slider {
  background-color: var(--color-border-light) !important;
}

.vue-slider-process {
  background-color: var(--color-text) !important;

  .muted & {
    opacity: @opacity-disabled;
  }
}

.vue-slider-dot {
  &::after {
    position: absolute;
    top: 5px;
    left: 5px;
    display: block;
    width: 5px;
    height: 5px;
    content: '';
    background-color: var(--color-text-dark);
    border-radius: 50%;
  }
}

.vue-slider-tooltip {
  top: 40px !important;
  font-size: @font-size4 !important;
  color: var(--color-tooltip-text) !important;
  background-color: var(--color-tooltip-bg) !important;
  border: 1px solid var(--color-tooltip-border) !important;
  border-radius: 4px !important;
  .transition;
  .shadow;

  &::before {
    display: none;
  }
}

.vue-slider-disabled {
  opacity: 0.26 !important;

  .vue-slider-tooltip-wrap {
    display: none !important;
  }
}
</style>
