<template>
  <div class="notifications-area" v-if="settings.enabled">
    <div
      class="notifications__counter notifications__counter--warning"
      v-if="unreadCount"
      v-tooltip="showUnreadNotificationsTooltip"
      @click="showNotifications"
    >
      <span class="icon-warning"></span>
      {{ unreadCount }}
    </div>

    <div
      class="notifications__counter"
      v-if="!unreadCount"
      @click="showNotifications"
      v-tooltip="showNotificationsTooltip"
    >
      <span class="icon-information"></span>
    </div>

    <div class="notifications__container flex--grow" ref="notificationsContainer">
      <div
        v-for="notify in notifications"
        :key="`${notify.message}${notify.date}`"
        class="notification"
        v-show="showExtendedNotifications"
        @click="onNotificationClickHandler(notify.id)"
        :class="{
          info: notify.type == 'INFO',
          warning: notify.type == 'WARNING',
          'has-action': notify.action && !notify.outdated,
          outdated: notify.outdated,
          success: notify.type == 'SUCCESS',
        }"
      >
        {{ notify.message }} <span v-if="notify.showTime"> {{ moment(notify.date) }} </span>
      </div>
    </div>
  </div>
</template>

<script lang="ts" src="./NotificationsArea.vue.ts"></script>

<style lang="less" scoped>
@import url('../styles/index');

.notifications-area {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-width: 50px;
  overflow: hidden;
}

.notifications__container {
  position: relative;
  height: 30px;
}

.notification {
  position: absolute;
  max-width: 100%;
  height: 30px;
  overflow: hidden;
  line-height: 30px;
  text-overflow: ellipsis;
  white-space: nowrap;
  animation: notify-appears 0.3s;
  .padding-left();
  .padding-right();
  .radius();

  &.info {
    color: @text-primary;
    background-color: fade(@text-primary, 15%);
  }

  &.warning {
    color: @red;
    background-color: fade(@red, 20%);
  }

  &.success {
    color: @accent;
    background-color: fade(@accent, 20%);
  }

  &.has-action {
    cursor: pointer;
  }

  &.outdated {
    animation: notify-disappears 1s forwards;
  }
}

.notifications__counter {
  margin-right: 10px;
  white-space: nowrap;
  cursor: pointer;

  &::before {
    padding-right: 12px;
    color: @text-primary;
    content: '|';
    opacity: 0.5;
  }

  .icon-warning {
    font-size: 15px;
  }
}

.notifications__counter--warning {
  color: @red;

  i {
    color: @red;
  }
}

@keyframes notify-appears {
  from {
    top: 50px;
    opacity: 0;
  }

  to {
    top: 0;
    opacity: 1;
  }
}

@keyframes notify-disappears {
  from {
    opacity: 1;
  }

  to {
    display: none;
    opacity: 0;
  }
}
</style>
