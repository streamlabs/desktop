<template>
  <div class="program-statistics">
    <ul class="program-statistics-list">
      <li class="program-statistics-item" v-tooltip.bottom="visitorTooltip">
        <i class="program-statistics-icon icon-visitor"></i
        ><span class="program-statistics-value">{{ viewers }}</span>
      </li>
      <li class="program-statistics-item" v-tooltip.bottom="commentTooltip">
        <i class="program-statistics-icon icon-comment"></i
        ><span class="program-statistics-value">{{ comments }}</span>
      </li>
      <li class="program-statistics-item" v-tooltip.bottom="adPointTooltip">
        <i class="program-statistics-icon icon-nicoad"></i
        ><span class="program-statistics-value">{{ adPoint }}</span>
      </li>
      <li class="program-statistics-item" v-tooltip.bottom="giftPointTooltip">
        <i class="program-statistics-icon icon-gift"></i
        ><span class="program-statistics-value">{{ giftPoint }}</span>
      </li>
    </ul>
  </div>
</template>

<script lang="ts" src="./ProgramStatistics.vue.ts"></script>
<style lang="less" scoped>
@import url('../../styles/index');

.program-statistics {
  display: flex;
  height: 32px;
  padding: 0 16px;
  border-top: 1px solid var(--color-border-light);
}

.program-statistics-list {
  display: flex;
  flex-grow: 1;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  margin: 0;
  list-style: none;
}

.program-statistics-item {
  display: flex;
  flex-grow: 1;
  align-items: center;

  &:not(:last-child) {
    margin-right: 16px;
  }
}

.program-statistics-icon {
  margin-right: 8px;
  font-size: @font-size2;
  color: var(--color-text-dark);
}

.program-statistics-value {
  flex-grow: 1;
  font-size: @font-size2;
  color: var(--color-text);
  text-align: center;
}
</style>
