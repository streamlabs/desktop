<template>
  <div class="hotkey" :data-test-id="description.replace(/\s+/, '_')">
    <text-input v-if="hotkey.isMarker" class="Hotkey-description" v-model="markerValue" />
    <div v-else class="Hotkey-description">{{ description }}</div>
    <div class="Hotkey-bindings">
      <div v-for="(binding, index) in bindings" :key="binding.key" class="hotkey-bindings__binding">
        <input
          type="text"
          class="Hotkey-input"
          :value="getBindingString(binding.binding)"
          @keydown="e => handlePress(e, index)"
          @mousedown="e => handlePress(e, index)"
        />
        <i class="Hotkey-control fa fa-plus" @click="addBinding(index)" />
        <i class="Hotkey-control fa fa-minus" @click="removeBinding(index)" />
      </div>
    </div>
  </div>
</template>

<script lang="ts" src="./Hotkey.vue.ts"></script>

<style lang="less" scoped>
@import '../../styles/index';

.hotkey {
  display: flex;
  flex-direction: row;
  .margin-bottom(3);
}

.Hotkey-description {
  width: 200px;
  padding-right: 10px;
}

.Hotkey-input {
  display: inline-block;
  width: 150px;
}

.Hotkey-control {
  margin-left: 15px;
  cursor: pointer;
  opacity: 0.6;

  &:hover {
    opacity: 1;
  }
}
</style>
