<template>
  <div class="loader">
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 117.46 128"
      style="enable-background: new 0 0 189.3 152.1"
      xml:space="preserve"
    >
      <path
        d="M5.27,40.289v64.456a10.593,10.593,0,0,0,10.307,10.785H27.847l6.669,11.256A2.328,2.328,0,0,0,36.675,128a2.444,2.444,0,0,0,2.092-1.215l6.669-11.256H81.224l6.663,11.256A2.4,2.4,0,0,0,90.043,128a2.43,2.43,0,0,0,2.092-1.215L98.8,115.529H112.35a10.606,10.606,0,0,0,10.38-10.785V40.289a10.61,10.61,0,0,0-10.38-10.794H73.2L95.981,5.85,90.32,0,63.9,27.478,37.55.131,31.895,5.989l22.637,23.5H15.58A10.6,10.6,0,0,0,5.27,40.289Z"
        transform="translate(-5.27)"
      ></path>
    </svg>
  </div>
</template>

<script lang="ts" src="./CustomLoader.vue.ts"></script>

<style lang="less" scoped>
.loader {
  width: 64px;
  animation: loading-animation 2s infinite;
}

svg {
  fill: #70a0af;
}

@keyframes loading-animation {
  50% {
    opacity: 0;
  }
}
</style>
