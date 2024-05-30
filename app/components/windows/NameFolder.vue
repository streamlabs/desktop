<template>
  <modal-layout :done-handler="submit">
    <form slot="content" @submit.prevent="submit">
      <p v-if="!error" class="NameSource-label">
        {{ $t('sources.enterTheNameOfFolder') }}
      </p>
      <p v-if="error" class="NameSource-label NameSource-label__error">
        {{ error }}
      </p>
      <input autofocus type="text" v-model="name" />
    </form>
  </modal-layout>
</template>

<script lang="ts" src="./NameFolder.vue.ts"></script>

<style lang="less" scoped>
@import url('../../styles/index');

.NameSource-label {
  margin-bottom: 8px;
  color: var(--color-text);
}

.NameSource-label__error {
  color: var(--color-error);
}
</style>
