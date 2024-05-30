<template>
  <modal-layout :show-controls="false" :customControls="true" no-scroll>
    <div slot="content">
      <ul class="confirm-list">
        <li class="confirm-list-item">
          <p class="confirm-message">{{ $t('settings.autoCompact.message') }}</p>
          <BoolInput :value="doNotShowAgain" @input="setDoNotShowAgain" />
        </li>
      </ul>
    </div>
    <div slot="controls">
      <button class="button button--secondary" @click="skip">
        {{ $t('settings.autoCompact.later') }}
      </button>
      <button class="button button--primary" @click="activate">
        {{ $t('settings.autoCompact.activate') }}
      </button>
    </div>
  </modal-layout>
</template>

<script lang="ts" src="./AutoCompactConfirmDialog.vue.ts"></script>

<style lang="less" scoped>
@import url('../../styles/index');

.input-container {
  flex-direction: column;
}

.confirm-message {
  margin-bottom: 24px;
  color: var(--color-text);
  white-space: pre-line;
}

.confirm-list {
  margin: 0;
  list-style: none;
}

.confirm-list-item {
  .radius;

  padding: 16px 16px 0;
  margin-bottom: 16px;
  color: var(--color-text);
  list-style: none;
  background: var(--color-bg-secondary);
}
</style>
