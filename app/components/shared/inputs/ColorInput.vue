<template>
  <div>
    <div class="input-wrapper">
      <div class="colorpicker">
        <div class="colorpicker__text" @click="togglePicker">
          <input class="colorpicker__input" type="text" readonly :value="value" />
          <div class="colorpicker__swatch" :style="swatchStyle" />
        </div>
        <color-picker
          :value="{ hex: value }"
          @input="value => emitInput(value.hex)"
          v-if="pickerVisible"
          class="colorpicker-menu"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts" src="./ColorInput.vue.ts"></script>

<style lang="less">
@import url('../../../styles/index');
</style>
