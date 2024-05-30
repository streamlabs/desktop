<template>
  <div
    class="container"
    :class="{ 'is-cropping': isCropping }"
    @mousedown="handleMouseDown"
    @mousemove="handleMouseMove"
    @mouseup="handleMouseUp"
  >
    <div class="message">
      {{ $t('sources.selectCroppingArea') }}<br />
      {{ $t('sources.pressEscapeToCancel') }}
    </div>
    <div v-if="isCropping" class="cropping-area" :style="croppingAreaStyle"></div>
  </div>
</template>

<script lang="ts" src="./CroppingOverlay.vue.ts"></script>

<style lang="less">
body {
  width: 100%;
  height: 100%;
  padding: 0;
  margin: 0;
  background-color: rgba(255, 255, 255, 40%);
}
</style>

<style lang="less" scoped>
.container {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 0;
  margin: 0;
}

.message {
  padding: 64px;
  color: #fff;
  background-color: rgba(0, 0, 0, 30%);
}

.cropping-area {
  position: absolute;
  pointer-events: none;
  border: 3px solid rgb(255, 105, 82);
}
</style>
