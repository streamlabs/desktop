<template>
  <div class="source-selector" data-test="SourceSelector">
    <div class="studio-controls-top">
      <h4 class="studio-controls__label" v-tooltip.bottom="sourcesTooltip">
        {{ $t('common.sources') }}
      </h4>
      <div class="studio-controls-top-sidebar">
        <i
          class="icon-folder icon-btn"
          @click="addFolder"
          v-tooltip.bottom="addGroupTooltip"
          data-test="AddFolder"
        />
        <i
          class="icon-add icon-btn"
          @click="addSource"
          v-tooltip.bottom="addSourceTooltip"
          data-test="Add"
        />
        <i
          class="icon-delete icon-btn"
          :class="{ disabled: activeItemIds.length === 0 }"
          @click="removeItems"
          v-tooltip.bottom="removeSourcesTooltip"
          data-test="Remove"
        />
        <i
          :class="{ disabled: !canShowProperties() }"
          class="icon-settings icon-btn"
          @click="sourceProperties"
          v-tooltip.bottom="openSourcePropertiesTooltip"
          data-test="Edit"
        />
      </div>
    </div>

    <sl-vue-tree
      :value="nodes"
      ref="slVueTree"
      @select="makeActive"
      @drop="handleSort"
      @toggle="toggleFolder"
      @contextmenu.native="showContextMenu()"
      @nodecontextmenu="(node, event) => showContextMenu(node.data.id, event)"
      @nodedblclick="node => sourceProperties(node.data.id)"
      :scrollAreaHeight="50"
      :maxScrollSpeed="15"
    >
      <template slot="title" slot-scope="{ node }">
        <div class="title-container">
          <span class="layer-icon">
            <i :class="determineIcon(node.isLeaf, node.data.sourceId)"></i>
          </span>
          <span class="item-title" :data-test="node.title">{{ node.title }}</span>
        </div>
      </template>

      <template slot="toggle" slot-scope="{ node }">
        <span v-if="!node.isLeaf && node.children.length">
          <i v-if="node.isExpanded" class="icon-drop-down-arrow" />
          <i v-if="!node.isExpanded" class="icon-drop-down-arrow icon-right" />
        </span>
      </template>

      <template slot="sidebar" slot-scope="{ node }" v-if="canShowActions(node.data.id)">
        <i
          class="source-selector-action"
          :class="lockClassesForSource(node.data.id)"
          @click.stop="toggleLock(node.data.id)"
          @dblclick.stop="() => {}"
        />
        <i
          class="source-selector-action"
          :class="visibilityClassesForSource(node.data.id)"
          @click.stop="toggleVisibility(node.data.id)"
          @dblclick.stop="() => {}"
        />
      </template>
    </sl-vue-tree>
  </div>
</template>

<script lang="ts" src="./SourceSelector.vue.ts"></script>

<style lang="less">
@import url('../styles/index');
@import url('~sl-vue-tree/dist/sl-vue-tree-dark.css');

.studio-controls-top-sidebar {
  display: flex;
  align-items: center;
}

.sl-vue-tree.sl-vue-tree-root {
  .radius;

  flex-grow: 1;
  overflow: auto;
  color: var(--color-text);
  background-color: var(--color-bg-tertiary);
  border: none;
}

.sl-vue-tree-nodes-list {
  .sl-vue-tree-root > & {
    padding-bottom: 0;
  }
}

.sl-vue-tree-node-item {
  min-height: @item-generic-size;
  padding: 0 12px;
  line-height: @item-generic-size;
  cursor: pointer;
  border: none;

  .sl-vue-tree-selected > & {
    background-color: var(--color-bg-active);
  }
}

.sl-vue-tree-cursor-inside {
  .sl-vue-tree-node-item& {
    border-color: var(--color-border-light);
  }
}

.sl-vue-tree-title,
.sl-vue-tree-sidebar {
  display: flex;
  align-items: center;
}

.sl-vue-tree-sidebar {
  flex-shrink: 0;
}

.sl-vue-tree-title {
  flex-grow: 1;
  overflow: hidden;
}

.sl-vue-tree-gap {
  width: 24px;
}

.title-container {
  display: flex;
  align-items: center;
  overflow: hidden;

  .sl-vue-tree-node-item:hover & {
    .transition();

    color: var(--color-text-light);
    opacity: 1;
  }

  .sl-vue-tree-selected & {
    .transition();

    color: var(--color-text-light);
  }
}

.item-title {
  .text-ellipsis();

  font-size: @font-size2;
}

.source-selector-action {
  display: inline-block;
  width: 16px;
  margin-left: 8px;
  color: var(--color-text);
  text-align: center;
  opacity: @opacity-disabled;

  .sl-vue-tree-node-item:hover & {
    .transition();

    color: var(--color-text-light);
    opacity: 1;
  }
}

i.disabled {
  cursor: inherit;
  opacity: @opacity-disabled;

  :hover {
    opacity: inherit;
  }
}

.layer-icon {
  display: inline-block;
  flex-shrink: 0;
  width: 20px;
  margin-right: 4px;
  text-align: left;

  i {
    font-size: @font-size2;
    font-weight: @font-weight-bold;
  }
}

.sl-vue-tree-toggle {
  display: inline-block;
  flex-shrink: 0;
  margin-right: 4px;

  i {
    display: block;
    width: 12px;
    font-size: 8px;
    color: var(--color-text);
    text-align: center;

    &.icon-right {
      transform: rotate(-90deg);
    }
  }
}

.sl-vue-tree-cursor {
  border-color: @navy;
}

//Simple Mode
.advanced-theme {
  .icon-folder {
    display: inline-block;
  }
}

.beginner-theme {
  .icon-folder {
    display: none;
  }
}
</style>
