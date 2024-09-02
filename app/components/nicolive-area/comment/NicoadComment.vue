<template>
  <div class="root comment-root" :class="chat.type" :title="computedTitle">
    <div class="comment-wrapper">
      <div class="comment-header"><i class="icon-nicoad"></i></div>
      <div class="comment-body">{{ computedContent }}</div>
    </div>
  </div>
</template>
<script lang="ts" src="./NicoadComment.vue.ts"></script>

<style lang="less" scoped>
@import url('../../../styles/_colors');
@import url('../../../styles/mixins');
@import url('./comment');

.comment-root {
  .common__comment-root;
  .comment-row-fade(@nicoad-brand-color);
}

.comment-wrapper {
  .common__comment-wrapper;
}

.comment-header {
  .common__comment-header;

  > i {
    color: var(--color-brand-nicoad);
  }
}

.comment-body {
  .common__comment-body;

  color: var(--color-text);

  [speaking='true'] & {
    color: var(--color-text-active);
  }
}
</style>
