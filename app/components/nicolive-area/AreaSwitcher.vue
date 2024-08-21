<template>
  <div class="container">
    <div class="contentContainer">
      <slot :name="activeContent.slotName" />
    </div>
    <div class="header" v-if="!isCompactMode">
      <popper trigger="click" :options="{ placement: 'bottom-start' }" @show="popper = $event">
        <div class="popper">
          <ul class="popup-menu-list">
            <li
              class="item"
              :class="{ active: content.slotName === activeContent.slotName }"
              :key="content.slotName"
              v-for="content in contents"
              @click="select(content.slotName)"
            >
              <p class="item-name">{{ content.name }}</p>
              <p class="item-text">{{ content.text }}</p>
            </li>
          </ul>
        </div>

        <div class="indicator" slot="reference">
          {{ activeContent.name }}
          <i class="icon-drop-down-arrow"></i>
        </div>
      </popper>
    </div>
  </div>
</template>

<script lang="ts" src="./AreaSwitcher.vue.ts"></script>

<style lang="less" scoped>
@import url('../../styles/index');

.container {
  position: relative;
  display: flex;
  flex-direction: column;
}

.header {
  position: absolute;
  top: 0;
  left: 0;
  z-index: @z-index-default-content;
  height: 40px;
}

.indicator {
  .transition;

  display: flex;
  align-items: center;
  height: 32px;
  padding: 8px;
  margin: 8px;
  font-size: @font-size4;
  line-height: 32px;
  color: var(--color-text-light);
  cursor: pointer;
  border-radius: 4px;

  &:hover {
    background-color: var(--color-button-tertiary-hover);
  }

  > i {
    margin-left: 8px;
    font-size: @font-size1;
  }
}

.contentContainer {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
}

.popper {
  .popper-styling;

  width: 320px;
  padding: 0;
  margin-left: 8px;

  .popup-menu-list {
    margin: 0;

    & > .item {
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: center;
      height: 64px;
      padding: 0 16px;
      text-align: left;
      cursor: pointer;

      &.active {
        .bg-hover();
      }

      &:not(.active):hover {
        .bg-hover();
      }
    }

    .item-name {
      margin: 0 0 4px;
      font-size: @font-size4;
      color: var(--color-text-light);
    }

    .item-text {
      margin: 0;
      font-size: @font-size2;
      color: var(--color-text);
    }
  }
}
</style>
