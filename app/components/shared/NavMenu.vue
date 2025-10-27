<template>
  <ul class="nav-menu" :class="{ 'nav-menu--child': isChild }">
    <slot></slot>
  </ul>
</template>

<script lang="ts" src="./NavMenu.vue.ts"></script>

<style lang="less" scoped>
@import '../../styles/index';

.nav-menu:not(.nav-menu--child) {
  .padding-top(2);
  .padding-right(3);
  .padding-left(0);

  flex: 0 0 240px;
  display: flex;
  flex-direction: column;
  margin-left: @0;
}

.nav-menu--child {
  padding: 0;
  margin: 0;
}
</style>
