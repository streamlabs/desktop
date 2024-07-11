<template>
  <div class="container">
    <div class="header" v-if="!isCompactMode">
      <i
        class="icon-ng icon-btn"
        v-tooltip.bottom="filterTooltip"
        @click="isFilterOpened = true"
      ></i>
      <i
        class="icon-menu-moderator icon-btn"
        v-tooltip.bottom="moderatorTooltip"
        @click="openModeratorSettings"
      ></i>
      <i
        class="icon-settings icon-btn"
        v-tooltip.bottom="settingsTooltip"
        @click="openCommentSettings"
      ></i>
    </div>
    <div class="content">
      <div class="list" ref="scroll">
        <component
          :class="{
            row: true,
            name: getDisplayName(item),
            hint: item.value.no === nameplateHintNo,
          }"
          v-for="item of items"
          :key="item.seqId"
          :is="componentMap[item.component]"
          :chat="item"
          :getFormattedLiveTime="getFormattedLiveTime"
          :commentMenuOpened="commentMenuTarget === item"
          :speaking="speakingSeqId === item.seqId"
          :nameplateHint="item.value.no === nameplateHintNo"
          @pinned="pin(item)"
          @commentMenu="showCommentMenu(item)"
          @commentUser="showUserInfo(item)"
        />
        <div class="sentinel" ref="sentinel"></div>
      </div>
      <div class="pinned" v-if="Boolean(pinnedComment)">
        <component
          class="comment-readonly"
          :class="{
            row: true,
            name: getDisplayName(pinnedComment),
          }"
          :is="componentMap[pinnedComment.component]"
          :chat="pinnedItem"
          :getFormattedLiveTime="getFormattedLiveTime"
          :commentMenuOpened="false"
          :speaking="false"
          :nameplateHint="false"
          @commentUser="showUserInfo(pinnedComment)"
        />
        <div class="close"><i class="icon-close icon-btn" @click="pin(null)"></i></div>
      </div>
      <div class="floating-wrapper">
        <button
          type="button"
          @click="scrollToLatest"
          class="scroll-to-latest button--tertiary"
          v-if="!isLatestVisible && items.length > 0"
        >
          <i class="icon-down-arrow"></i>最新のコメントへ移動
        </button>
        <button
          class="button--circle button--tertiary"
          v-tooltip.bottom="commentReloadTooltip"
          @click="refreshConnection"
        >
          <i class="icon-reload"></i>
        </button>
        <button
          class="button--circle button--tertiary"
          v-tooltip.bottom="
            speakingEnabled ? commentSynthesizerOnTooltip : commentSynthesizerOffTooltip
          "
          @click="speakingEnabled = !speakingEnabled"
        >
          <i :class="speakingEnabled ? 'icon-speaker' : 'icon-mute'"></i>
        </button>
      </div>
      <div class="created-notice" v-if="showPlaceholder">
        <p class="created-notice-large">配信準備状態です</p>
        <p class="created-notice-small">
          番組開始前の確認を行うことができます。<br />&#91; 番組開始 &#93;
          をクリックすると視聴者に公開されます。
        </p>
      </div>
    </div>
    <comment-form class="comment-form" />
    <comment-filter
      class="overlay"
      @close="isFilterOpened = false"
      v-if="isFilterOpened && !isCompactMode"
    />
  </div>
</template>

<script lang="ts" src="./CommentViewer.vue.ts"></script>
<style lang="less" scoped>
@import url('../../styles/index');

.container {
  display: flex;
  flex-grow: 1;
  width: 100%;
  background-color: var(--color-bg-tertiary);
}

.header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  width: 100%;
  height: 48px;
  padding: 4px 16px;
  border-bottom: 1px solid var(--color-border-light);

  > .icon-btn {
    margin-left: 16px;

    &:first-child {
      margin-left: auto;
    }
  }
}

.content {
  position: relative;
  display: flex;
  flex-direction: column;
  flex-grow: 1;
}

.list {
  flex-grow: 1;
  height: 0; // 100%がなぜか動かなくなったので workaround (Electron 6.1.11)
  padding-top: 8px;
  overflow-x: hidden;
  overflow-y: auto;
}

.sentinel {
  height: 4px;
  margin-top: -4px;
  pointer-events: none;
}

.pinned {
  position: absolute;
  top: 8px;
  right: 8px;
  left: 8px;
  z-index: @z-index-default-content;
  display: flex;
  padding: 0;
  font-size: @font-size2;
  background-color: var(--color-popper-bg-dark);
  border: 1px solid var(--color-border-light);
  .radius;

  & /deep/ .comment-wrapper {
    padding: 8px 0;
  }

  & > .close {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    width: 12px;
    height: 12px;
    margin: 8px 8px 0 0;

    & > .icon-btn {
      margin: 0;
      font-size: @font-size2;
    }
  }
}

.scroll-to-latest {
  .transition;

  display: flex;
  align-items: center;
  height: 32px;
  padding: 0 16px;
  font-size: @font-size2;
  line-height: 32px;
  color: var(--color-button-label);
  text-align: center;
  cursor: pointer;
  border-radius: 16px;

  > i {
    margin-right: 8px;
    font-size: @font-size1;
  }
}

.comment-form {
  flex-shrink: 0;
}

.overlay {
  position: absolute;
  z-index: @z-index-expand-content; // AreaSwitcherのheaderより大きく
  width: 100%;
  height: 100%;
  background-color: var(--color-bg-tertiary);
}

.floating-wrapper {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: @z-index-default-content;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  pointer-events: none;

  button {
    margin: 0 8px;
    pointer-events: auto;
  }
}

.created-notice {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  padding: 8px;
  pointer-events: none;
  transform: translate(-50%, -50%);
}

.created-notice-large {
  margin: 0;
  font-size: @font-size4;
  font-weight: @font-weight-bold;
  color: var(--color-text);
  text-align: center;
}

.created-notice-small {
  margin-top: 4px;
  font-size: @font-size2;
  color: var(--color-text);
  text-align: center;
}

.icon-menu-moderator {
  font-size: @font-size5;
}
</style>
