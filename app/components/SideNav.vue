<template>
  <div class="side-nav">
    <div class="primary-tab">
      <div class="side-nav-item">
        <a @click="toggleCompactMode" class="link">
          <i v-if="isCompactMode" class="icon-full-mode" :title="$t('common.fullMode')" />
          <i v-if="!isCompactMode" class="icon-compact-mode" :title="$t('common.compactMode')" />
        </a>
      </div>
      <template v-if="isCompactMode && isUserLoggedIn">
        <div class="secondary-tab">
          <div class="side-nav-item">
            <a
              @click="compactModeTab = 'niconico'"
              class="link niconico-tab"
              :class="{
                active: compactModeTab === 'niconico',
                'notify-new-comment': notifyNewComment,
              }"
              data-test="compact-tab-niconico"
            >
              <i :class="{ 'icon-namaco': true }" :title="$t('common.compactModeTab.niconico')" />
            </a>
          </div>
          <div class="side-nav-item">
            <a
              @click="compactModeTab = 'studio'"
              class="link studio-tab"
              :class="{ active: compactModeTab === 'studio' }"
              data-test="compact-tab-studio"
            >
              <i :class="{ 'icon-video': true }" :title="$t('common.compactModeTab.studio')" />
            </a>
          </div>
        </div>
      </template>
      <div class="side-nav-item" v-if="isDevMode">
        <a @click="openDevTools" class="link">
          <i class="icon-dev" title="開発者ツール" />
        </a>
      </div>
    </div>

    <template v-if="!isCompactMode">
      <div class="bottom-tools">
        <div class="side-nav-item">
          <a
            @click="studioMode"
            class="link"
            :class="{ active: studioModeEnabled }"
            :title="$t('common.studioMode')"
          >
            <i class="icon-studio-mode" />
          </a>
        </div>
        <div class="side-nav-item feedback-button">
          <a @click="openFeedback" class="link" :title="$t('common.feedback')">
            <i class="icon-feedback" />
          </a>
        </div>
        <div class="side-nav-item help-button">
          <a @click="openHelp" class="link" :title="$t('common.help')">
            <i class="icon-help" />
          </a>
        </div>
        <div class="side-nav-item information-button">
          <a @click="openInformations" class="link" :title="$t('informations.title')">
            <i class="icon-notification" :class="{ isUnseen: hasUnseenInformation }" />
          </a>
        </div>
        <div class="side-nav-item">
          <a
            @click="openSettingsWindow"
            class="link"
            data-test="OpenSettings"
            :title="$t('common.settings')"
          >
            <i class="icon-settings" />
          </a>
        </div>
      </div>
    </template>
    <div class="side-nav-profile">
      <login />
    </div>
  </div>
</template>

<script lang="ts" src="./SideNav.vue.ts"></script>

<style lang="less" scoped>
@import url('../styles/index');

.side-nav {
  .dividing-border(right);

  display: flex;
  flex-direction: column;
  align-items: center;
  width: 48px;
  background-color: var(--color-bg-quaternary);
}

.link {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 36px;

  &.active {
    color: var(--color-text-active);
  }
}

.primary-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: auto;

  .link {
    position: relative;
    height: 48px;

    i {
      font-size: @font-size6;
    }
  }
}

.secondary-tab {
  display: flex;
  flex-direction: column;
  align-items: center;

  &::before {
    width: 18px;
    height: 1px;
    margin: 8px 0;
    content: '';
    background-color: var(--color-border-light);
  }

  .link {
    position: relative;
    height: 48px;

    .icon-video {
      font-size: @font-size5;
    }

    .icon-namaco {
      font-size: @font-size8;
    }
  }

  .niconico-tab {
    // 新着バッジ
    &::after {
      position: absolute;
      top: 8px;
      right: 8px;
      display: block;
      width: 12px;
      height: 12px;
      content: '';
      background-color: var(--color-accent-variant);
      border: 2px solid var(--color-bg-quaternary);
      border-radius: 50%;
      transform: scale(0);
      .transition;
    }

    &.notify-new-comment {
      &::after {
        transform: scale(1);
      }
    }
  }
}

.bottom-tools {
  display: flex;
  flex-direction: column;
  align-items: center;

  .link {
    height: 36px;
  }

  &::after {
    width: 18px;
    height: 1px;
    margin: 8px 0;
    content: '';
    background-color: var(--color-border-light);
  }
}

.side-nav-profile {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 48px;
  margin-bottom: 8px;
}

.icon-notification {
  position: relative;

  // お知らせ通知
  &.isUnseen {
    &::after {
      position: absolute;
      top: -6px;
      right: -6px;
      display: block;
      width: 12px;
      height: 12px;
      content: '';
      background-color: var(--color-accent-variant);
      border: 2px solid var(--color-bg-quaternary);
      border-radius: 50%;
    }
  }
}
</style>
