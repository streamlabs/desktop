<template>
  <div class="volmeter-container">
    <canvas class="volmeter" ref="canvas" />
    <div class="volmeter-spacer" ref="spacer" />
  </div>
</template>

<script lang="ts" src="./MixerVolmeter.vue.ts"></script>

<style lang="less" scoped>
@import url('../styles/index');

.volmeter {
  position: absolute;
  overflow: hidden;
}

.volmeter-spacer {
  margin: 8px 0;
}
</style>
