<template>
  <modal-layout :showControls="false">
    <div slot="content">
      <h4 v-if="!notificationsCount">
        {{ $t('notifications.noNotification') }}
      </h4>

      <div v-for="(notificationsService, groupName) in notificationGroups" :key="groupName">
        <h4 v-if="notificationsService.length">
          {{
            groupName == 'unread' ? $t('notifications.newNotifications') : $t('notifications.log')
          }}
        </h4>
        <div
          class="notification"
          v-for="notify in notificationsService"
          :key="notify.id"
          @click="onNotificationClickHandler(notify.id)"
          :class="{
            unread: notify.unread,
            'has-action': notify.action,
          }"
        >
          <div class="icon">
            <span class="icon-notification" v-if="notify.type == 'INFO'"></span>
            <span class="icon-warning" v-if="notify.type == 'WARNING'"></span>
          </div>
          <div class="message">{{ notify.message }}</div>
          <div class="date">{{ moment(notify.date) }}</div>
        </div>
      </div>
    </div>
  </modal-layout>
</template>

<script lang="ts" src="./Notifications.vue.ts"></script>

<style lang="less" scoped>
@import url('../../styles/index');

.notification {
  display: grid;
  grid-template-columns: 30px 1fr 130px;
  padding: 5px 10px;
  margin-bottom: 5px;
  color: @text-primary;
  background: @hover;
  border-color: @hover;
  .border();

  &.has-action:hover {
    color: @white;
    cursor: pointer;
    background: @bg-secondary;
    border-color: @bg-secondary;
  }

  &:last-child {
    margin-bottom: 20px;
  }

  .icon-warning {
    color: @red;
  }

  .icon-notification,
  .icon-warning {
    margin-right: 4px;
  }

  .date {
    text-align: right;
  }
}
</style>
