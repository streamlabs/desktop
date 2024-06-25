<template>
  <div class="program-info">
    <div class="community-icon" :class="{ 'is-onAir': isOnAir }">
      <img :src="communitySymbol" class="community-thumbnail" :alt="communityName" />
    </div>
    <div class="program-info-description">
      <h1 class="program-title">
        <a
          :href="watchPageURL"
          @click.prevent="openInDefaultBrowser($event)"
          class="program-title-link link"
          v-tooltip.bottom="programTitle"
        >
          {{ programTitle }}
        </a>
      </h1>
      <h2 class="community-name">
        <i
          v-if="programIsMemberOnly"
          class="icon-lock"
          v-tooltip.bottom="programIsMemberOnlyTooltip"
        ></i>
        <a
          :href="communityPageURL"
          @click.prevent="openInDefaultBrowser($event)"
          class="community-name-link link"
          v-tooltip.bottom="communityName"
        >
          {{ communityName }}
        </a>
      </h2>
    </div>
    <popper
      trigger="click"
      :options="{ placement: 'bottom-end' }"
      @show="showPopupMenu = true"
      @hide="showPopupMenu = false"
    >
      <div class="popper">
        <div class="popup-menu-head">{{ programTitle }}</div>
        <ul class="popup-menu-list">
          <li class="popup-menu-item">
            <a @click.prevent="openInDefaultBrowser($event)" :href="watchPageURL" class="link"
              ><i class="icon-browser"></i>番組ページを開く</a
            >
          </li>
          <li class="popup-menu-item">
            <a @click="copyProgramURL" class="link"
              ><i :class="hasProgramUrlCopied ? 'icon-check' : 'icon-clipboard-copy'"></i
              >番組URLをコピーする</a
            >
          </li>
        </ul>
        <ul class="popup-menu-list">
          <li class="popup-menu-item">
            <a @click="editProgram" class="link"><i class="icon-edit"></i>番組を編集する</a>
          </li>
        </ul>
        <ul class="popup-menu-list">
          <li class="popup-menu-item">
            <a @click.prevent="openInDefaultBrowser($event)" :href="xShareURL" class="link"
              ><i class="icon-x"></i>Xでポストする</a
            >
          </li>
          <li class="popup-menu-item">
            <a @click.prevent="openInDefaultBrowser($event)" :href="contentTreeURL" class="link"
              ><i class="icon-contents-tree"></i>コンテンツツリーを見る</a
            >
          </li>
          <li class="popup-menu-item">
            <a @click.prevent="openInDefaultBrowser($event)" :href="creatorsProgramURL" class="link"
              ><i class="icon-creator-promotion-program"></i>この番組で収入を得る</a
            >
          </li>
        </ul>
      </div>
      <div class="indicator" :class="{ 'is-show': showPopupMenu }" slot="reference">
        <i class="icon-drop-down-arrow"></i>
      </div>
    </popper>
  </div>
</template>

<script lang="ts" src="./ProgramInfo.vue.ts"></script>
<style lang="less" scoped>
@import url('../../styles/index');

.program-info {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 16px;
}

.program-info-description {
  flex-grow: 1;
  min-width: 0;
}

.program-title {
  display: flex;
  align-items: center;
  margin-bottom: 4px;
}

.program-title-link {
  .text-ellipsis;

  display: inline-block;
  font-size: @font-size4;
  font-weight: @font-weight-bold;
  color: var(--color-text-light);
}

.program-button {
  margin-left: 16px;
}

.community-name {
  display: flex;
  align-items: center;
  margin: 0;

  .icon-lock {
    margin-right: 8px;
    font-size: @font-size1;
    color: var(--color-text);
  }
}

.community-name-link {
  .text-ellipsis;

  display: inline-block;
  font-size: @font-size2;
}

.community-icon {
  position: relative;
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  margin-right: 16px;
  border: 2px solid var(--color-border-accent);
  border-radius: 50%;

  .community-thumbnail {
    position: absolute;
    top: 50%;
    left: 50%;
    z-index: @z-index-default-content;
    border-radius: 50%;
    transform: translate(-50%, -50%);
  }

  &.is-onAir {
    border-color: var(--color-red);

    &::before,
    &::after {
      position: absolute;
      top: 50%;
      left: 50%;
      display: block;
      content: '';
      background-color: var(--color-red);
      border-radius: 50%;
      transform: translate(-50%, -50%);
      animation-duration: 6s;
      animation-iteration-count: infinite;
    }

    &::after {
      animation-name: thumbnail-live-effect1;
    }

    &::before {
      animation-name: thumbnail-live-effect2;
    }
  }
}

.popper {
  .popper-styling();

  width: 260px;
}

.indicator {
  .transition;

  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-left: 16px;
  cursor: pointer;
  border-radius: 50%;

  i {
    font-size: @font-size1;
  }

  &:hover {
    background-color: var(--color-bg-active);

    i {
      color: var(--color-text-light);
    }
  }

  &.is-show {
    background-color: var(--color-bg-active);

    i {
      color: var(--color-text-active);
    }
  }
}

@keyframes thumbnail-live-effect1 {
  0% {
    width: 40px;
    height: 40px;
    opacity: 0.8;
  }

  40% {
    width: 50px;
    height: 50px;
    opacity: 0;
  }

  100% {
    opacity: 0;
  }
}

@keyframes thumbnail-live-effect2 {
  0% {
    width: 40px;
    height: 40px;
    opacity: 0.8;
  }

  40% {
    width: 60px;
    height: 60px;
    opacity: 0;
  }

  100% {
    opacity: 0;
  }
}
</style>
