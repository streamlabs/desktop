<template>
  <div class="comment-form">
    <input
      type="text"
      ref="input"
      :readonly="isCommentSending"
      :disabled="isCommentSending || programEnded"
      :placeholder="
        programEnded ? '番組が終了したため、放送者コメントを投稿できません' : 'コメント入力'
      "
      v-model="operatorCommentValue"
      class="comment-input"
      maxlength="80"
      @keydown.enter="sendOperatorComment($event)"
    />
    <button
      @click="sendOperatorComment($event)"
      :disabled="isCommentSending || operatorCommentValue.length === 0 || programEnded"
      class="comment-button"
    >
      <i class="icon-comment-send"></i>
    </button>
  </div>
</template>

<script lang="ts" src="./CommentForm.vue.ts"></script>
<style lang="less" scoped>
@import url('../../styles/index');

.comment-form {
  position: relative;
  display: flex;
  justify-content: center;
  border-top: 1px solid var(--color-border-light);
}

.comment-input {
  flex-grow: 1;
  width: auto;
  height: 48px;
  padding: 0 0 0 16px;
  font-size: @font-size2;
  background-color: var(--color-bg-tertiary);
  border: none;
  border-radius: 0;

  &:focus {
    background-color: var(--color-bg-tertiary);
  }

  &::placeholder {
    color: var(--color-text-dark);
  }
}

.comment-button {
  height: 48px;
  padding: 0 16px;

  > i {
    color: var(--color-text);
    .transition;
  }

  &:hover {
    > i {
      color: var(--color-text-light);
    }
  }

  &:disabled {
    > i {
      color: var(--color-text-disabled);
    }
  }
}
</style>
