<template>
  <div
    @click="handleClick"
    class="toggleinput__container"
    :class="{ 'toggleinput__container--active': value }"
  >
    <div class="toggleinput__track" :class="{ 'toggleinput__track--active': value }"></div>
    <div class="toggleinput__handle" :class="{ 'toggleinput__handle--active': value }"></div>
  </div>
</template>

<script lang="ts" src="./ToggleInput.vue.ts"></script>

<style lang="less" scoped>
@import url('../../../styles/index');

.toggleinput__container {
  position: relative;
  width: 44px;
  height: 22px;
  padding: 5px;
  margin: 0 2px;
  .cursor--pointer();
}

.toggleinput__track {
  .transition;

  width: 100%;
  height: 100%;
  background-color: @grey;
  border-radius: 30px;
}

.toggleinput__handle {
  .transition();

  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  width: 22px;
  height: 22px;
  background-color: #37474f;
  border-radius: 50%;
  box-shadow: 0 2px 6px 0 rgba(0, 0, 0, 76%);

  &:hover {
    background-color: #303f47;
  }
}

.toggleinput__container--active {
  .toggleinput__handle {
    transform: translateX(22px);
  }

  .toggleinput__track {
    background-color: @teal;
  }
}
</style>
