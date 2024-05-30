<template>
  <span class="number-input">
    <input
      type="number"
      :placeholder="options.placeholder"
      :value="value"
      @input="emitInput($event.target.value)"
      :name="uuid"
      v-validate="validate"
    />

    <span class="input-error" v-show="errors.first(uuid)">
      {{ errors.first(uuid) }}
    </span>
  </span>
</template>

<script lang="ts" src="./NumberInput.vue.ts"></script>

<style lang="less" scoped>
.number-input {
  position: relative;

  .input-error {
    position: absolute;
    white-space: nowrap;
  }
}
</style>
