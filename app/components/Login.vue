<template>
  <div class="login__status" v-if="loggedIn">
    <a v-if="!isCompactMode" class="link" @click="logout" :title="$t('common.logout')">
      <i class="icon-log-out" />
    </a>
    <a @click="openUserPage" class="user__profile" :title="username">
      <img class="user__thumbnail" :src="userIcon" />
    </a>
  </div>
  <div v-else>
    <a
      v-if="!isCompactMode"
      class="link help_tip_content"
      @click="login"
      :title="$t('common.login')"
    >
      <i class="icon-log-in"></i>
      <help-tip :dismissable-key="loginHelpTipDismissable" mode="login">
        <div slot="title" v-text="$t('common.loginHelpTipTitle')"></div>
        <div slot="content" v-text="$t('common.loginHelpTipContent')"></div>
      </help-tip>
    </a>
  </div>
</template>

<script lang="ts" src="./Login.vue.ts"></script>

<style lang="less" scoped>
@import url('../styles/index');

.login__status {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.user__profile {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 40px;

  .user__thumbnail {
    display: flex;
    align-items: center;
    width: 24px;
    height: 24px;
    background-color: @text-secondary;
    border-radius: 50%;
  }
}

.link {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 36px;
}

.help_tip_content {
  position: relative;
}
</style>
