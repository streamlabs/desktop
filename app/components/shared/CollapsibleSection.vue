<template>
  <div class="collapsible-section__container">
    <div
      @click="onToggleVisibleHandler"
      class="collapsible-section__title"
      :class="{ 'collapsible-section__title--visible': visible }"
    >
      <i class="icon-down"></i>
      <h2>{{ title }}</h2>
    </div>
    <slot v-if="visible"></slot>
  </div>
</template>

<script lang="ts" src="./CollapsibleSection.vue.ts"></script>

<style lang="less">
@import url('../../styles/index');

.collapsible-section__container {
  .padding-bottom(2);
}

.collapsible-section__title {
  background-color: @light-1;
  .margin-bottom(2);
  .radius(1);
  .padding(2);
  .flex();
  .flex--start();
  .flex--align-center();
  .cursor--pointer;

  &:not(.collapsible-section__title--visible) {
    .icon-down {
      transform: rotate(180deg);
    }
  }

  h2 {
    color: @day-title;
    .margin--none;

    text-transform: capitalize;
  }

  .icon-down {
    .transition();
    .margin-right(1);

    font-size: 5px;
  }
}

.night-theme {
  .collapsible-section__title {
    background-color: @dark-4;

    h2 {
      color: @white;
    }
  }
}
</style>
