<template>
  <div :data-test="testingAnchor" class="input-container">
    <div v-if="value.showDescription !== false" class="input-label">
      <label>{{ value.description }}</label>
    </div>
    <div class="input-wrapper">
      <div class="slider-container">
        <Slider
          @input="value => updateValue(value)"
          :value="localValue"
          :disabled="value.enabled == false"
          :max="value.maxVal"
          :min="value.minVal"
          :interval="value.stepVal"
          tooltip="always"
          :valueBox="true"
          :enabled="value.enabled"
          :usePercentages="value.usePercentages"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts" src="./ObsSliderInput.vue.ts"></script>

<style lang="less" scoped>
@import url('../../../styles/index');

.slider-container {
  position: relative;
  height: 45px;
}

.slider-label {
  position: absolute;
  bottom: 4px;
  color: #70a0af;

  &.slider-label--left {
    left: 0;
  }

  &.slider-label--right {
    right: 0;
  }
}

.slider-value {
  position: absolute;
  top: 23px;
  right: 0;
  width: 45px;
  height: 20px;
  padding: 0 4px;
  text-align: right;
  cursor: default;
  border: none;
  border-radius: 2px;
}
</style>
