<template>
  <div>
    <div class="onboarding-step">
      <div class="onboarding-title">{{ $t('onboarding.sceneCollectionsImportTitle') }}</div>
      <div class="onboarding-desc">{{ $t('onboarding.sceneCollectionsImportDescription') }}</div>
      <ul class="scene-collections-list">
        <li v-for="collection in sceneCollections" :key="collection.id">
          {{ collection.name }}
        </li>
      </ul>
      <button class="button button--primary button--lg" @click="next">
        {{ $t('common.continue') }}
      </button>
    </div>
  </div>
</template>

<script lang="ts" src="./SceneCollectionsImport.vue.ts"></script>

<style lang="less" scoped>
@import url('../../../styles/index');

.scene-collections-list {
  width: 100%;
  height: 200px;
  padding: 10px;
  margin-left: 0;
  overflow: auto;
  color: @white;
  list-style: none;
  background: @bg-secondary;
  border-radius: 3px;
}
</style>
