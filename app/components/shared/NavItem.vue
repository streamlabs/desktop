<template>
  <li
    class="nav-item"
    :class="{ active: to === value, disabled: enabled == false, 'nav-item--child': isSubItem }"
    @click="onClickHandler"
  >
    <i v-if="ico" :class="ico" @click="onIconClickHandler"></i>
    <div class="nav-item__content">
      <slot></slot>
      <div v-if="expanded" class="nav-item__children">
        <slot name="children"></slot>
      </div>
    </div>
    <i v-if="expandable" :class="expanded ? 'icon-subtract' : 'icon-add'" />
  </li>
</template>

<script lang="ts" src="./NavItem.vue.ts"></script>

<style lang="less" scoped>
@import url('../../styles/index');

.nav-item {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  height: 40px;
  padding: 0;
  padding-left: 16px;
  font-size: @font-size4;
  color: var(--color-text);
  list-style: none;
  cursor: pointer;

  &.nav-item--child {
    padding-left: 0;
    border-left: 0;
  }

  &.active {
    color: var(--color-text-active);

    i {
      color: var(--color-text-active);
    }
  }

  &:not(.active):hover {
    color: var(--color-text-light);

    i {
      color: var(--color-text-light);
    }
  }

  &.disabled {
    color: var(--color-text-disabled);
    cursor: default;
  }

  i {
    margin-right: 16px;
    font-size: @font-size4;
  }
}

.nav-item__content {
  // max-width: calc(~"100% - 20px");
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  line-height: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-item__children {
  .margin-top();
}
</style>
