<template>
  <modal-layout :show-cancel="false" :done-handler="done" :fixedSectionHeight="250" bare-content>
    <display slot="fixed" :sourceId="sourceId" />

    <div slot="content" class="container" data-test="SourceFilters">
      <NavMenu v-model="selectedFilterName" class="side-menu">
        <div class="controls">
          <i class="icon-add icon-btn" @click="addFilter" data-test="Add"></i>
          <i
            class="icon-delete icon-btn"
            v-if="selectedFilterName"
            @click="removeFilter"
            data-test="Remove"
          ></i>
        </div>

        <sl-vue-tree
          :value="nodes"
          ref="slVueTree"
          @select="makeActive"
          @drop="handleSort"
          :allowMultiselect="false"
        >
          <template slot="title" slot-scope="{ node }">
            <div class="title-container">
              <span class="layer-icon">
                <i
                  @click="toggleVisibility(node.title)"
                  class="icon-unhide"
                  v-if="node.data.visible"
                ></i>
                <i
                  @click="toggleVisibility(node.title)"
                  class="icon-hide"
                  v-if="!node.data.visible"
                ></i>
              </span>
              &nbsp;
              <span class="item-title" :data-test="node.title">{{ node.title }}</span>
            </div>
          </template>
        </sl-vue-tree>
      </NavMenu>

      <div class="content">
        <div v-if="selectedFilterName">
          <GenericForm v-model="properties" @input="save" :key="selectedFilterName"></GenericForm>
        </div>
        <div v-if="!selectedFilterName">
          {{ $t('filters.noFilterMessage') }}
        </div>
      </div>
    </div>
  </modal-layout>
</template>

<script lang="ts" src="./SourceFilters.vue.ts"></script>

<style lang="less" scoped>
@import url('~sl-vue-tree/dist/sl-vue-tree-dark.css');

.content {
  flex-grow: 1;
  padding: 16px;
  overflow: auto;
}

.container {
  display: flex;
  align-content: stretch;
  align-items: stretch;
  height: 100%;
}

.side-menu {
  background-color: transparent;

  & > .sl-vue-tree-toggle {
    display: none;
  }

  & /deep/ .sl-vue-tree-node-item {
    padding: 0 16px;
    background-color: transparent;
  }
}

.controls {
  height: 48px;
  padding: 16px;
}
</style>
