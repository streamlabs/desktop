<template>
  <div class="w-form-group__wrapper slider-container">
    <vue-slider
      class="slider w-form-group__input"
      :value="value"
      @input="value => updateValue(value)"
      :max="options.max"
      :min="options.min"
      :interval="options.interval"
      :speed="0"
      :height="4"
      :formatter="formatter"
      :piecewise="!!options.interval"
      ref="slider"
      :piecewiseStyle="{
        position: 'absolute',
        backgroundColor: nightMode ? '#253239' : '#eaecee',
        height: '2px',
        width: '2px',
        borderRadius: '1px',
        top: '12px',
      }"
      :piecewiseActiveStyle="{ backgroundColor: '#3c4c53' }"
    />
    <input
      v-if="options.hasValueBox && !options.usePercentages"
      class="slider-input"
      type="text"
      :value="value"
      @input="updateValue(parseFloat($event.target.value))"
      @keydown="handleKeydown"
    />
  </div>
</template>

<script lang="ts" src="./SliderInput.vue.ts"></script>

<style lang="less">
@import url('../../../styles/index');

.slider-container {
  position: relative;
  display: flex;
  width: 100%;
}

.slider-input {
  width: 60px;
  margin-left: 10px;
}

.slider {
  flex-grow: 1;
  height: auto;
  padding: 8px;
  margin: 0;
  background: transparent;

  &:hover {
    .vue-slider-tooltip {
      color: @navy !important;
    }
  }
}

.vue-slider {
  background-color: @slider-background-color !important;
}

.vue-slider-process {
  background-color: @slider-progress-color !important;
}

.vue-slider-dot {
  &::after {
    position: absolute;
    top: 5px;
    left: 5px;
    display: block;
    width: 6px;
    height: 6px;
    content: '';
    background-color: @slider-progress-color;
    border-radius: 50%;
  }
}

.vue-slider-tooltip {
  top: 40px !important;
  font-size: 13px !important;
  color: @grey !important;
  background-color: transparent !important;
  border: none !important;
  .transition;

  &::before {
    display: none;
  }
}

.vue-slider-piecewise {
  .vue-slider-piecewise-dot {
    display: none !important;
  }
}

.night-theme {
  .vue-slider {
    background-color: @night-slider-bg!important;
  }

  .slider {
    &:hover {
      .vue-slider-tooltip {
        color: @white !important;
      }
    }
  }
}
</style>
