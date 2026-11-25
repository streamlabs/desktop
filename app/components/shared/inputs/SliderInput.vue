<template>
  <div
    class="w-form-group__wrapper slider-container"
    :class="[options.displayValue === 'false' ? '' : 'has-tooltip']"
    data-role="input"
    data-type="slider"
    :data-name="options.name"
    :data-value="localValue"
  >
    <slider
      :value="interval >= 1 ? Math.round(localValue) : localValue"
      @input="value => updateLocalValue(value)"
      :max="max"
      :min="min"
      :interval="interval"
      :tooltip="options.displayValue || 'always'"
      :speed="0"
      :suffix="usePercentages ? '%' : ''"
      :data="options.data"
      :simpleTheme="options.simpleTheme"
    />
    <input
      v-if="options.hasValueBox && !options.usePercentages"
      class="slider-input"
      type="text"
      :value="localValue"
      @input="updateLocalValue($event.target.value)"
      @keydown="handleKeydown"
    />
  </div>
</template>

<script lang="ts" src="./SliderInput.vue.ts"></script>

<style lang="less" scoped>
.slider-container {
  width: 100%;
  display: flex;
  position: relative;

  & /deep/ .s-slider {
    .vue-slider {
      background-color: var(--border);
    }

    .vue-slider-process {
      background-color: var(--slider-bg);
    }

    .vue-slider-dot-handle {
      background-color: var(--paragraph);

      &::before,
      &::after {
        color: var(--button);
      }
    }

    .vue-slider-tooltip {
      color: var(--paragraph);
    }
  }
}

.slider-container.has-tooltip {
  padding-bottom: 16px;
}

.slider-input {
  width: 50px;
  margin-left: 16px;
}
</style>
