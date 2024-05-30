<template>
  <div>
    <div class="section">
      <button class="button button--action" @click="showNotifications">
        {{ $t('notifications.showNotifications') }}
      </button>
      <button class="button button--sm button-soft-warning" @click="restoreDefaults">
        {{ $t('notifications.restoreDefaults') }}
      </button>
    </div>
    <div class="section">
      <div class="section-content">
        <GenericForm v-model="settingsFormData" @input="saveNotificationsSettings" />
      </div>
    </div>
    <div class="section">
      <h4>
        {{ $t('notifications.troubleshooterNotifications') }}
      </h4>

      <GenericForm v-model="troubleshooterFormData" @input="saveTroubleshooterSettings" />
    </div>
  </div>
</template>

<script lang="ts" src="./NotificationsSettings.vue.ts"></script>
