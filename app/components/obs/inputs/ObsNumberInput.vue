<template>
  <div :data-test="testingAnchor" class="input-container">
    <div class="input-label">
      <label>{{ value.description }}</label>
    </div>
    <div class="input-wrapper">
      <input
        ref="input"
        type="text"
        :value="value.value"
        :disabled="value.enabled == false"
        @input="updateValue($event.target.value)"
      />
    </div>
  </div>
</template>

<script lang="ts" src="./ObsNumberInput.vue.ts"></script>
