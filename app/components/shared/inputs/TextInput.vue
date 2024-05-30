<template>
  <span class="text-input">
    <input
      type="text"
      :placeholder="metadata.placeholder"
      :value="value"
      @input="emitInput($event.target.value)"
      :name="uuid"
      v-validate="validate"
    />
  </span>
</template>

<script lang="ts" src="./TextInput.vue.ts"></script>

<style lang="less" scoped>
@import url('../../../styles/index');

.text-input {
  position: relative;
  display: flex;
}
</style>
