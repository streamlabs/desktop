<template>
  <modal-layout :showControls="false">
    <div class="informations" slot="content" data-test="Informations">
      <ul class="information-list" v-if="!fetching && !hasError">
        <li
          class="information-list-item"
          :class="{ 'is-new': isNew(information.date) }"
          v-for="(information, index) in informations"
          :key="index"
        >
          <a class="information-link" :href="information.url" @click="handleAnchorClick($event)">
            <p class="information-title">{{ information.title }}</p>
            <time class="information-date">{{ format(information.date) }}</time>
          </a>
        </li>
      </ul>
      <p v-else-if="fetching" class="information-fetching">読み込み中...</p>
      <div class="information-error" v-else-if="hasError">
        <h2 class="error-title">{{ $t('informations.errorHeading') }}</h2>
        <p class="error-text">{{ $t('informations.errorDescription') }}</p>
        <i18n class="error-attention" path="informations.errorAttention" tag="p">
          <a
            place="link"
            href="https://blog.nicovideo.jp/niconews/category/se_n-air/"
            @click="handleAnchorClick($event)"
            >{{ $t('informations.errorAttentionLink') }}</a
          >
        </i18n>
      </div>
    </div>
  </modal-layout>
</template>

<script lang="ts" src="./Informations.vue.ts"></script>

<style lang="less" scoped>
@import url('../../styles/index');

.informations {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
}

.information-list {
  margin: -16px;
  list-style: none;
  background: var(--color-background); // TODO: .modal-layoutの背景色を一括で変えるまでの暫定対応
}

.information-list-item {
  border-bottom: 1px solid var(--color-border-emphasis-low);

  &.is-new {
    background-color: var(--color-highlight-medium);
  }
}

.information-link {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-xs);
  padding: var(--spacing-md) var(--spacing-lg);
  line-height: var(--line-height-lg);
  text-decoration: none;

  &:hover {
    background-color: var(--color-bg-active);
  }
}

.information-date {
  font-size: var(--font-size-xs);
  color: var(--color-object-emphasis-low);
}

.information-title {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-object-emphasis-high);
  text-decoration: none;
}

.information-fetching {
  margin: auto;
  font-size: var(--font-size-md);
  line-height: var(--line-height-lg);
  color: var(--color-object-emphasis-low);
}

.information-error {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  gap: var(--spacing-sm);
  align-items: center;
  justify-content: center;
  line-height: var(--line-height-lg);
}

.error-title {
  margin: 0;
  font-size: var(--font-size-md);
  font-weight: bold;
  color: var(--color-object-emphasis-high);
}

.error-text {
  margin: 0;
  font-size: var(--font-size-sm);
  color: var(--color-object-emphasis-medium);
  text-align: center;
  white-space: pre-line;
}

.error-attention {
  margin-bottom: 0;
  font-size: var(--font-size-sm);
  color: var(--color-object-emphasis-medium);
}
</style>
