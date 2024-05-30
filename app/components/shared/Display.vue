<template>
  <div class="display" ref="display" @click="onClickHandler"></div>
</template>

<script lang="ts" src="./Display.vue.ts"></script>

<style lang="less" scoped>
.display {
  flex-grow: 1;
  height: 100%;
  background-color: black;
}
</style>
