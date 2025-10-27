<template>
  <li
    class="nav-item"
    :class="{ active: to === value, disabled: enabled === false, 'nav-item--child': isSubItem }"
    @click="onClickHandler"
  >
    <UltraIcon v-if="ultra" class="ultra-icon" @click="onIconClickHandler" />
    <i v-if="ico" :class="ico" @click="onIconClickHandler" :style="icoStyles"></i>
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
@import '../../styles/index';

.nav-item {
  .margin-bottom();

  cursor: pointer;
  list-style: none;
  border-left: 1px solid transparent;
  padding-left: 46px;
  font-size: 14px;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;

  &.nav-item--child {
    padding-left: 0;
    border-left: 0;
  }

  &.active {
    .weight(@medium);

    opacity: 1;
    border-color: var(--title);
    color: var(--title);

    .fa,
    i {
      color: var(--title);
    }
  }

  &:hover {
    opacity: 1;
  }

  &.disabled {
    opacity: 0.3;
    cursor: default;
  }

  .fa,
  i {
    color: var(--icon);
    position: relative;
    margin-right: -16px;
    left: -24px;
    width: 16px;
    padding: 3px 0;
  }

  .ultra-icon {
    position: relative;
    margin-right: -16px;
    left: -24px;
    width: 16px;
  }
}

.nav-item__content {
  overflow: hidden;
  // max-width: calc(~"100% - 20px");
  width: 100%;
  max-width: 100%;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nav-item__children {
  .margin-top();
}
</style>
