<template>
  <div :data-test="testingAnchor" class="input-container">
    <div class="input-label">
      <label>
        {{ value.description }}
      </label>
    </div>
    <div class="input-wrapper editable-list">
      <div class="editable-list__bar">
        <i @click="menu.popup()" class="icon-add icon-btn editable-list__control" data-test="Add" />
        <i
          @click="handleRemove"
          class="icon-delete icon-btn editable-list__control"
          data-test="Remove"
        />
        <i
          @click="handleEdit"
          class="icon-settings icon-btn editable-list__control"
          data-test="Edit"
        />
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
@import url('../../../styles/index');

.editable-list__list {
  background: @bg-secondary;
  border: 1px solid @bg-secondary;
}

.editable-list__bar {
  display: flex;
  flex-direction: row;
  margin-bottom: 10px;
}
</style>
