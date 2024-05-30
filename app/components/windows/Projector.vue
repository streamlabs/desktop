<template>
  <div class="projector-container">
    <div class="projector-fullscreen" @keydown="exitFullscreen" v-if="fullscreen">
      <display :source-id="sourceId" />
    </div>
    <modal-layout v-else bare-content :showControls="false">
      <div slot="content" class="projector-windowed">
        <div class="projector-buttons">
          <button
            class="button button--trans"
            v-for="(display, index) in allDisplays"
            :key="display.id"
            @click="enterFullscreen(display)"
          >
            Fullscreen Display {{ index + 1 }}: {{ display.size.width }}x{{ display.size.height }}
          </button>
        </div>
        <display :source-id="sourceId" />
      </div>
    </modal-layout>
  </div>
</template>

<script lang="ts" src="./Projector.vue.ts"></script>

<style lang="less" scoped>
.projector-container {
  height: 100%;
}

.projector-fullscreen {
  display: flex;
  height: 100%;
}

.projector-windowed {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.projector-display {
  flex-grow: 1;
}

.projector-buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
}
</style>
