<template>
  <modal-layout :showControls="false">
    <div class="user-info" slot="content">
      <div class="user-detail">
        <img
          :src="userIconURL"
          width="64"
          height="64"
          class="user-icon"
          :alt="userName"
          :title="userName"
          @error.once="userIconURL = defaultUserIconURL"
        />
        <div class="user-detail-body">
          <div class="user-name-wrapper">
            <div class="user-name">{{ userName }}</div>
            <i
              class="icon-moderator"
              v-tooltip.bottom="moderatorTooltip"
              v-if="isModerator"
            ></i>
            <i
              class="icon-supporter"
              v-tooltip.bottom="supporterTooltip"
              v-if="isSupporter"
            ></i>
          </div>
          <div class="user-account">
            <p class="user-id">ID: {{ userId }}</p>
            <p class="user-type" :class="{ 'is-premium': isPremium }">
              {{ isPremium ? 'プレミアム会員' : '一般会員' }}
            </p>
          </div>
        </div>
        <div class="user-button-wrapper">
          <button class="button button--round button--primary" @click="openUserPage">
            ユーザーページを見る
          </button>
          <popper
            trigger="click"
            :options="{ placement: 'bottom-end' }"
            @show="showPopupMenu = true"
            @hide="showPopupMenu = false"
          >
            <div class="popper">
              <ul class="popup-menu-list">
                <li class="popup-menu-item">
                  <a @click="copyUserId" class="link">ユーザーIDをコピー</a>
                </li>
              </ul>
              <ul class="popup-menu-list">
                <li class="popup-menu-item">
                  <a @click="blockUser" class="link" v-if="!isBlockedUser">配信からブロック</a>
                  <a @click="unBlockUser" class="link" v-if="isBlockedUser">配信用ブロックから削除</a>
                </li>
              </ul>
              <ul class="popup-menu-list">
                <li class="popup-menu-item">
                  <a @click="unFollowUser" class="link" v-if="isFollowing">フォローを解除</a>
                  <a @click="followUser" class="link" v-if="!isFollowing">ユーザーをフォロー</a>
                </li>
              </ul>
              <ul class="popup-menu-list">
                <li class="popup-menu-item">
                  <a @click="addModerator" class="link" v-if="!isModerator">モデレーターに追加</a>
                  <a @click="removeModerator" class="link text--red" v-if="isModerator">モデレーターから削除</a>
                </li>
              </ul>
            </div>
            <div class="button--circle button--secondary" v-tooltip.bottom="otherMenuTooltip" :class="{ 'is-show': showPopupMenu }" slot="reference">
              <i class="icon-ellipsis-horizontal"></i>
            </div>
          </popper>
        </div>
      </div>
      <div class="tab-list">
        <button
          type="button"
          @click="changeTab('konomi')"
          class="button--tab"
          :class="{ active: currentTab === 'konomi' }"
        >
          好きなもの
        </button>
        <button
          type="button"
          @click="changeTab('comment')"
          class="button--tab"
          :class="{ active: currentTab === 'comment' }"
        >
          直近のコメント
        </button>
      </div>
      <div class="tag-list" v-show="currentTab === 'konomi'">
        <div class="tag-list-body">
          <div
            v-for="tag in konomiTags"
            :key="tag.name"
            :class="{ tagname: true, common: tag.common }"
          >
            {{ tag.name }}
          </div>
        </div>
      </div>
      <div class="comment-list" v-show="currentTab === 'comment'">
        <div class="comment-list-body" ref="scroll">
          <div class="list">
            <component
              class="comment-readonly"
              v-for="item of comments"
              :key="item.seqId"
              :is="componentMap[item.component]"
              :chat="item"
              :getFormattedLiveTime="getFormattedLiveTime"
            />
            <div class="sentinel" ref="sentinel"></div>
          </div>
          <div class="floating-wrapper">
            <button
              type="button"
              @click="scrollToLatest"
              class="scroll-to-latest button--tertiary"
              v-if="!isLatestVisible && comments.length > 0"
            >
              <i class="icon-down-arrow"></i>最新のコメントへ移動
            </button>
          </div>
        </div>
      </div>
    </div>
  </modal-layout>
</template>

<script lang="ts" src="./UserInfo.vue.ts"></script>

<style lang="less" scoped>
@import url('../../styles/index');

.user-info {
  position: relative;
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  margin: -16px;
  overflow: hidden;
  background-color: var(--color-bg-secondary);

  &::before {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 60px;
    content: '';
    background: url('../../../media/images/pattern.png') center repeat / auto 300%;
  }
}

.user-detail {
  z-index: @z-index-default-content;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px;
}

.user-detail-body {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  margin-top: 4px;
}

.user-name-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
}

.user-icon {
  width: 64px;
  height: 64px;
  border: 4px solid var(--color-bg-secondary);
  border-radius: 9999px;;
}

.user-name {
  font-size: @font-size4;
  font-weight: @font-weight-bold;
  line-height: @font-line-height-normal;
  color: var(--color-text-light);
  text-align: center;
  .text-ellipsis;
}

.icon-moderator {
  margin-left: 4px;
  font-size: @font-size5;
  color: var(--color-primary);
}

.icon-supporter {
  margin-left: 4px;
  font-size: @font-size5;
  color: var(--color-secondary);
}

.user-account {
  display: flex;
  margin-top: 4px;
}

.user-id {
  margin: 0;
  font-size: @font-size2;
  line-height: @font-line-height-tight;
  color: var(--color-text);
}

.user-type {
  margin: 0 0 0 8px;
  font-size: @font-size2;
  line-height: @font-line-height-tight;
  color: var(--color-text);

  &.is-premium {
    color: @niconico-premium-color;
  }
}

.user-button-wrapper {
  display: flex;
  justify-content: center;
  width: 100%;
  margin-top: 16px;

  > .button {
    flex-grow: 1;
    max-width: 288px;
    margin-right: 8px;
  }
}

.popper {
  .popper-styling();
}

.tab-list {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  height: 40px;
  padding: 0 16px;
  border-bottom: 1px solid @border;

  > button {
    flex-grow: 1;
    height: 100%;
  }
}

.tag-list {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  overflow: hidden;
}

.tag-list-header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  height: 40px;
  padding: 8px 16px;
  font-size: @font-size4;
  font-weight: @font-weight-bold;
  color: var(--color-text-light);
  border-bottom: 1px solid var(--color-border-light);
}

.tag-list-body {
  display: flex;
  flex-wrap: wrap;
  padding: 16px 8px 8px 16px;
  overflow: auto;

  &:empty {
    flex-grow: 1;
    align-items: center;
    justify-content: center;
    padding: 0;

    &::before {
      font-size: @font-size2;
      color: var(--color-text-dark);
      content: '設定されていません';
    }
  }
}

.tagname {
  height: 20px;
  padding: 0 8px;
  margin: 0 8px 8px 0;
  font-size: @font-size2;
  line-height: 20px;
  color: var(--color-text-light);
  background-color: var(--color-bg-primary);
  border-radius: 9999px;

  &.common {
    color: var(--color-text-active);
    background-color: var(--color-bg-quaternary);
  }
}

.comment-list {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  overflow: hidden;
  background-color: var(--color-bg-secondary);
}

.comment-list-header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  height: 40px;
  padding: 8px 16px;
  font-size: @font-size4;
  font-weight: @font-weight-bold;
  color: var(--color-text-light);
  border-bottom: 1px solid var(--color-border-light);
}

.comment-list-body {
  position: relative;
  display: flex;
  flex-grow: 1;
  flex-wrap: wrap;
  overflow: auto;
}

.list {
  flex-grow: 1;
  padding: 8px 0;
  overflow-x: hidden;
  overflow-y: auto;

  &:empty {
    &::before {
      font-size: @font-size2;
      color: var(--color-text-dark);
      content: 'コメントが取得できませんでした';
    }
  }
}

.sentinel {
  height: 4px;
  margin-top: -4px;
  pointer-events: none;
}

.floating-wrapper {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
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

</style>
