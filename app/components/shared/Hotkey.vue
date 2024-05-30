<template>
  <div class="hotkey">
    <div class="Hotkey-description">
      {{ description }}
    </div>
    <div class="Hotkey-bindings">
      <transition-group name="bindings" tag="div">
        <div
          v-for="(binding, index) in bindings"
          :key="binding.key"
          class="hotkey-bindings__binding"
        >
          <input
            type="text"
            class="Hotkey-input"
            :value="getBindingString(binding.binding)"
            @keydown="e => handleKeydown(e, index)"
          />
          <i class="Hotkey-control icon-plus" @click="addBinding(index)" />
          <i class="Hotkey-control icon-minus" @click="removeBinding(index)" />
        </div>
      </transition-group>
    </div>
  </div>
</template>

<script lang="ts" src="./Hotkey.vue.ts"></script>

<style lang="less" scoped>
@import url('../../styles/index');

.hotkey {
  display: flex;
  flex-direction: row;
}

.Hotkey-description {
  flex-grow: 1;
  padding-right: 16px;
  padding-bottom: 16px;
}

.Hotkey-input {
  display: inline-block;
  width: 160px;
}

.Hotkey-control {
  margin-left: 16px;
  cursor: pointer;

  &:hover {
    color: var(--color-text-light);
  }
}

.bindings-enter-active,
.bindings-leave-active {
  .transition();
}

.bindings-enter,
.bindings-leave-to {
  opacity: 0;
  transform: scale(1, 0);
}

.hotkey-bindings__binding {
  display: flex;
  align-items: center;
  width: 220px;
  margin-bottom: 16px;
}
</style>
