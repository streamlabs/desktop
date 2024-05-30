<template>
  <div>
    <div class="section">
      <div class="section-content">
        <GenericForm v-model="settingsFormData" @input="saveSettings" />
      </div>
    </div>
  </div>
</template>

<script lang="ts" src="./AppearanceSettings.vue.ts"></script>
