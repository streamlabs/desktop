<template>
  <div class="step section">
    <div class="step-header">
      <h3 class="step-title">{{ title }}</h3>
      <p class="step-description">{{ description }}</p>
    </div>
    <div class="step-body">
      <slot />
    </div>
  </div>
</template>

<script lang="ts" src="./Step.vue.ts"></script>

<style lang="less" scoped>
@import url('../../styles/index');

.step {
  height: 100%;
  padding: 0;
  margin: 0;
}

.step-header {
  padding: 16px;
  border-bottom: 1px solid var(--color-bg-quinary);
}

.step-body {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  padding: 0;
  border: none;
}

.step-title {
  margin-bottom: 4px;
  font-size: 16px;
  color: var(--color-text-light);
}

.step-description {
  margin: 0;
  font-size: @font-size4;
  color: var(--color-text-dark);
}
</style>
