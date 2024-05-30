<template>
  <div
    :data-test="testingAnchor"
    class="input-container"
    :class="{ disabled: value.enabled == false }"
  >
    <div class="input-label"></div>
    <div class="input-wrapper">
      <div class="checkbox" @click="handleClick">
        <input type="checkbox" :checked="value.value" :disabled="value.enabled == false" />
        <label
          ><span v-if="value.showDescription !== false">{{ value.description }}</span></label
        >
      </div>
    </div>
  </div>
</template>

<script lang="ts" src="./ObsBoolInput.vue.ts"></script>
