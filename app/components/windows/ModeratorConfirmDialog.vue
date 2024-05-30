<template>
  <modal-layout :show-controls="false" :customControls="true">
    <div class="content" slot="content">
      <div v-if="operation === 'add'">
        <p class="confirm-title">
          <span class="text-ellipsis">{{ userName }}</span
          ><span class="text-suffix">さんをモデレーターに追加しますか？</span>
        </p>
        <p class="confirm-description">
          追加すると視聴中または視聴を開始した追加対象のユーザーに通知されます
        </p>
        <a @click="openModeratorHelpPage" class="text-link">
          <i class="icon-question"></i>
          <span>モデレーターとは</span>
        </a>
      </div>
      <div v-else-if="operation === 'remove'">
        <p class="confirm-title">
          <span class="text-ellipsis">{{ userName }}</span
          ><span class="text-suffix">さんをモデレーターから削除しますか？</span>
        </p>
        <p class="confirm-description">削除されたことは削除対象のユーザーに通知されません</p>
      </div>
    </div>
    <div slot="controls">
      <button class="button button--secondary" :disabled="isClosing" @click="cancel">
        {{ $t('common.cancel') }}
      </button>
      <button
        class="button button--primary"
        :class="{ 'button--alert': operation === 'remove' }"
        :disabled="isClosing"
        @click="ok"
      >
        {{ operation === 'add' ? '追加する' : operation === 'remove' ? '削除する' : operation }}
      </button>
    </div>
  </modal-layout>
</template>

<script lang="ts" src="./ModeratorConfirmDialog.vue.ts"></script>

<style lang="less" scoped>
@import url('../../styles/index');

.content {
  padding: 8px;
}

.confirm-title {
  display: flex;
  margin-bottom: 16px;
  font-size: @font-size5;
  line-height: @font-line-height-normal;
  color: var(--color-text-light);
}

.confirm-description {
  margin-bottom: 8px;
  font-size: @font-size4;
  line-height: @font-line-height-normal;
  color: var(--color-text);
}

.about-moderator {
  display: flex;
  align-items: center;
  margin: 0;
}

.text-suffix {
  flex-shrink: 0;
}
</style>
