<template>
  <div class="main" data-test="Connect">
    <div class="onboarding-step">
      <NAirLogo class="onboarding-logo" />
      <div class="onboarding-title" v-if="isSecurityUpgrade">Re-Authorize</div>
      <div class="onboarding-desc" v-if="isSecurityUpgrade">
        {{ $t('onboarding.secutityUpgrade') }}
        <a @click="contactSupport">{{ $t('onboarding.contactSupport') }}</a>
      </div>
      <div class="onboarding-desc" v-else>{{ $t('onboarding.urgeToSignIn') }}</div>
      <div class="signup-buttons">
        <button
          class="button button--accent button--niconico"
          :disabled="loadingState"
          @click="authPlatform('niconico')"
          data-test="NiconicoSignup"
        >
          {{ $t('onboarding.loginToNiconico') }}
        </button>
      </div>
      <button
        @click="skipOnboarding"
        class="link link--skip"
        :disabled="loadingState"
        v-if="!isSecurityUpgrade"
        data-test="Skip"
      >
        {{ $t('onboarding.skipConnect') }}
      </button>
      <footer>©DWANGO Co.,Ltd.</footer>
    </div>
  </div>
</template>

<script lang="ts" src="./Connect.vue.ts"></script>

<style lang="less" scoped>
.signup-buttons {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;

  button {
    margin-bottom: 24px;
  }
}

footer {
  position: fixed;
  bottom: 0;
  width: 100%;
  padding: 16px;
  color: var(--color-text-dark);
}

.icon-spin {
  animation: icon-spin 2s infinite linear;
}

@keyframes icon-spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(359deg);
  }
}

// ログインボタン
.button--niconico {
  width: 188px;
  height: 40px;
}

// スキップリンク
.link--skip {
  text-decoration: underline;
}
</style>
