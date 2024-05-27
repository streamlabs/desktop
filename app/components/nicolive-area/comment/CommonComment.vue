<template>
  <div class="root comment-root" :class="[chat.type, { pseudoHover: commentMenuOpened }]">
    <div
      class="comment-wrapper"
      :speaking="speaking"
      @dblclick="$emit('pinned')"
    >
      <div class="comment-number">{{ chat.value.no }}</div>
      <div class="comment-box">
        <div
          class="comment-name-box"
          v-if="computedName"
          @click.stop="$emit('commentUser')"
        >
          <img
            class="comment-icon"
            :src="userIconURL"
            :alt="computedName"
            :title="computedName"
            @error.once="userIconURL = defaultUserIconURL"
          />
          <div class="comment-name">{{ computedName }}</div>
          <i
            class="icon-moderator"
            v-tooltip.bottom="moderatorTooltip"
            v-if="chat.isModerator"
          ></i>
          <i
            class="icon-supporter"
            v-tooltip.bottom="supporterTooltip"
            v-if="chat.isSupporter"
          ></i>
        </div>
        <div class="comment-body" :title="computedTitle">{{ computedContent }}</div>
      </div>
      <div class="comment-misc" @click.stop="$emit('commentMenu')">
        <i class="icon-btn icon-ellipsis-vertical"></i>
      </div>
    </div>
    <div class="nameplate-hint" v-if="nameplateHint">
      <div class="nameplate-hint-header">［なふだ機能］を使ったコメントが投稿されました</div>
      <div class="nameplate-hint-body">
        ニックネームをクリックして、視聴者のことをもっとよく知ってみよう!
      </div>
      <div class="nameplate-hint-anchor">
        <a
          @click.prevent="openInDefaultBrowser($event)"
          href="https://qa.nicovideo.jp/faq/show/21148?site_domain=default"
          class="text-link"
          ><i class="icon-question"></i><span>なふだ機能とは？</span></a
        >
      </div>
    </div>
  </div>
</template>
<script lang="ts" src="./CommonComment.vue.ts"></script>

<style lang="less" scoped>
@import url('../../../styles/index');
@import url('./comment');

.comment-root {
  .common__comment-root;
}

.comment-wrapper {
  .common__comment-wrapper;

  .comment-root:not(.comment-readonly):hover &,
  .comment-root:not(.comment-readonly):hover &.pseudoHover {
    .bg-hover();
  }
}

.comment-number {
  .common__comment-number;

  .name & {
    margin-top: 4px;
  }
}

.comment-box {
  display: flex;
  flex-direction: column;
}

.comment-name-box {
  display: none;
  pointer-events: none;

  .name & {
    display: flex;
    flex-direction: row;
    align-items: center;
    height: 24px;
    margin: 0 16px 4px;
    margin-left: 16px;
    pointer-events: all;
    cursor: pointer;
  }
}

.comment-icon {
  width: 24px;
  height: 24px;
  margin-right: 8px;
  border-radius: 9999px;
}

.comment-name {
  font-size: @font-size2;
  color: var(--color-text);

  .comment-name-box:hover & {
    color: var(--color-text-active);
  }
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

.comment-body {
  .common__comment-body;

  color: var(--color-text-light);

  .operator & {
    color: var(--color-accent);
  }

  [speaking='true'] & {
    color: var(--color-text-active);
  }
}

.comment-misc {
  .common__comment-misc;

  position: absolute;
  top: 0;
  right: 0;
  display: none;

  .comment-root:not(.comment-readonly):hover & {
    display: block;
  }
}

.nameplate-hint {
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 12px 16px;
  margin: 8px 16px;
  background-color: var(--color-bg-quinary);
  .radius;
}

.nameplate-hint-header {
  .bold;

  margin-bottom: 4px;
  font-size: @font-size3;
  color: var(--color-text-light);
}

.nameplate-hint-body {
  font-size: @font-size2;
  color: var(--color-text);
}

.nameplate-hint-anchor {
  margin-top: 8px;
  font-size: @font-size2;
}

.nameplate-hint div {
  flex: 1;
}
</style>
