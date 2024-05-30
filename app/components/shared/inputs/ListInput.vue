<template>
  <div>
    <label>{{ title }}</label>
    <multiselect
      :value="currentMultiselectValue"
      :options="multiselectOptions"
      track-by="value"
      :close-on-select="true"
      :placeholder="placeholder"
      label="description"
      :allow-empty="options.allowEmpty"
      @input="onInputHandler"
    >
    </multiselect>
    <div v-if="selectedOption && selectedOption.description" class="description">
      {{ selectedOption.description }}
    </div>
  </div>
</template>

<script lang="ts" src="./ListInput.vue.ts"></script>

<style lang="less" scoped>
.description {
  margin-top: 6px;
  font-size: 11px;
  font-style: italic;
}
</style>
