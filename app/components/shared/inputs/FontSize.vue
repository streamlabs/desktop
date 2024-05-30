<template>
  <slider-input
    :metadata="sliderOptions"
    :value="sliderValue"
    @input="value => updateValue(value)"
  />
</template>

<script lang="ts" src="./FontSize.vue.ts"></script>
