<template>
  <modal-layout :done-handler="submit">
    <form slot="content" @submit.prevent="submit">
      <p v-if="!error" class="NameScene-label">
        {{ $t('scenes.enterTheNameOfTheScene') }}
      </p>
      <p v-if="error" class="NameScene-label NameScene-label__error">
        {{ error }}
      </p>
      <input autofocus type="text" v-model="name" />
    </form>
  </modal-layout>
</template>

<script lang="ts" src="./NameScene.vue.ts"></script>

<style lang="less" scoped>
@import url('../../styles/index');

.NameScene-label {
  margin-bottom: 8px;
  color: var(--color-text);
}

.NameScene-label__error {
  color: var(--color-error);
}
</style>
