<template>
  <modal-layout :show-cancel="false" :done-handler="close">
    <div slot="content">
      <div class="manage-scene-collections__header">
        <div class="input-wrapper input-wrapper--search">
          <input
            class="input--search"
            type="text"
            :placeholder="$t('common.search')"
            v-model="searchQuery"
          />
        </div>
        <button class="button button--primary" @click="create">
          <i class="icon-plus" />
          {{ $t('common.createNew') }}
        </button>
      </div>
      <div class="manage-scene-collections__body">
        <editable-scene-collection
          v-for="collection in collections"
          :key="collection.id"
          :collection-id="collection.id"
        />
      </div>
    </div>
  </modal-layout>
</template>

<script lang="ts" src="./ManageSceneCollections.vue.ts"></script>

<style lang="less" scoped>
@import url('../../styles/index');

.manage-scene-collections__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.input-wrapper--search {
  width: 50%;
}

button {
  .input-wrapper--search + & {
    margin-bottom: 16px;
  }
}

.manage-scene-collections--new {
  &:hover {
    background: @hover;
  }
}

.manage-scene-collections__body {
  .radius;

  display: flex;
  flex-direction: column;
  overflow-y: auto;
  background-color: var(--color-bg-secondary);
}
</style>
