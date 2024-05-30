<template>
  <div :data-test="testingAnchor" class="input-container">
    <div class="input-label">
      <label>{{ value.description }}</label>
    </div>
    <div class="input-wrapper">
      <div class="flex">
        <input
          type="text"
          ref="input"
          :value="value.value"
          class="path__input"
          @change="handleChange"
        />
        <button @click="showFileDialog" class="path__browse-button button button--secondary">
          {{ $t('common.browse') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script lang="ts" src="./ObsPathInput.vue.ts"></script>

<style lang="less" scoped>
@import url('../../../styles/index');

.path__input {
  border-radius: 4px 0 0 4px;
}

.path__browse-button {
  border-radius: 0 4px 4px 0;
}
</style>
