<template>
  <div class="tabs__container">
    <div class="tabs" :class="className">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        class="button--tab"
        :class="{ active: tab.value === value }"
        @click="showTab(tab.value)"
      >
        {{ tab.name }}
      </button>
    </div>
    <div class="tab-content" v-if="!hideContent">
      <slot v-for="tab in tabs" :name="tab.value" v-if="tab.value === value" />
    </div>
  </div>
</template>

<script lang="ts" src="./Tabs.vue.ts"></script>

<style lang="less" scoped>
@import url('../styles/index');

.tabs__container {
  .flex__column;

  flex-grow: 1;
}

.tabs {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  height: 40px;
  padding: 0 16px;
  border-bottom: 1px solid var(--color-border-light);

  > button {
    flex-basis: 0;
    flex-grow: 1;
    height: 100%;
  }
}

.tab-content {
  .flex__column;

  position: relative;
  flex-grow: 1;
  overflow-y: auto;
}
</style>
