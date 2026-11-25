<template>
  <div class="input-container">
    <div class="input-label">
      <label>
        {{ value.description }}
      </label>
    </div>
    <div
      class="input-wrapper editable-list"
      data-role="input"
      data-type="editable-list"
      :data-name="value.name"
      :data-value="JSON.stringify(list)"
    >
      <div class="editable-list__bar">
        <i @click="menu.popup()" class="icon-add icon-button editable-list__control" />
        <i @click="handleRemove" class="icon-subtract icon-button editable-list__control" />
        <i @click="handleEdit" class="icon-settings icon-button editable-list__control" />
      </div>
      <selector
        class="editable-list__list"
        :items="list"
        :activeItems="activeItem ? [activeItem] : []"
        @select="handleSelect"
        @sort="handleSort"
      />
    </div>
  </div>
</template>

<script lang="ts" src="./ObsEditableListInput.vue.ts"></script>

<style lang="less" scoped>
@import '../../../styles/index';

.editable-list {
  display: flex;
  flex-direction: column;
  height: 150px;
}

.editable-list__list {
  background: var(--input-bg);
  border-color: var(--button);
  border: 0;
  flex-grow: 1;
}

.editable-list__bar {
  display: flex;
  flex-direction: row;
  margin-bottom: 10px;
}
</style>
