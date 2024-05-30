<template>
  <div class="container">
    <div
      v-for="option in metadata.options"
      :key="option.value"
      class="image-container radius"
      :class="[value === option.value ? 'active' : '']"
      @click="emitInput(option.value)"
    >
      <img :src="option.description" />
    </div>
  </div>
</template>

<script lang="ts" src="./ImagePickerInput.vue.ts"></script>

<style lang="less" scoped>
@import url('../../../styles/index');

.container {
  display: flex;
  flex-wrap: wrap;
  width: 370px;
}

.image-container {
  position: relative;
  width: 80px;
  height: 80px;
  margin: 2px;
  border: 1px solid @day-input-border;
  .transition();
  .radius();

  &:hover {
    cursor: pointer;
    border-color: @teal-light-opac;
  }

  img {
    position: absolute;
    top: 50%;
    left: 50%;
    width: auto;
    height: 70px;
    transform: translate(-50%, -50%);
  }

  &.active {
    background-color: @teal-light-opac;
    border-color: @teal-med-opac;
  }
}

.night-theme {
  .image-container {
    border-color: @night-border;

    &:hover {
      border-color: @teal-light-opac;
    }

    &.active {
      border-color: @teal-med-opac;
    }
  }
}
</style>
