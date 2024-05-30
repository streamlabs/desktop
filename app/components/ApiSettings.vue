<template>
  <div>
    <div class="section">
      <button class="button button--soft-warning" @click="restoreDefaults">Restore Defaults</button>
    </div>

    <div class="section">
      <div class="section-content">
        <ObsTextInput :value="tokenInput">
          <button class="button button--default" @click="generateToken">Update</button>
        </ObsTextInput>
      </div>
    </div>

    <GenericFormGroups v-model="settingsFormData" category="API" @input="save" />
  </div>
</template>

<script lang="ts" src="./ApiSettings.vue.ts"></script>
