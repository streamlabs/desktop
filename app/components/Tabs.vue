<template>
  <div class="tabs__container">
    <div class="tabs" :class="className">
      <button
        v-for="tab in tabs"
        :key="tab.value"
        class="tab-button"
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
  position: relative;
  box-sizing: border-box;
  display: flex;
  width: 100%;
  height: 54px;
  padding: 0 16px;
}

.tab-content {
  .flex__column;

  position: relative;
  flex-grow: 1;
  overflow-y: auto;
}
</style>
