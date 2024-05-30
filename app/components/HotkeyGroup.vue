<template>
  <div class="section">
    <div
      class="section-title section-title--dropdown"
      v-if="title"
      :class="{ 'section-title--opened': !collapsed }"
      @click="collapsed = !collapsed"
    >
      <h4>
        <i v-if="collapsed === true" class="icon-plus section-title__icon" />
        <i v-if="collapsed === false" class="icon-minus section-title__icon" />
        {{ title }}
      </h4>
    </div>
    <div v-show="!collapsed" class="section-content section-content--dropdown">
      <hotkey :hotkey="hotkey" class="hotkey" v-for="hotkey in hotkeys" :key="hotkey.resourceId" />
    </div>
  </div>
</template>

<script lang="ts" src="./HotkeyGroup.vue.ts"></script>
