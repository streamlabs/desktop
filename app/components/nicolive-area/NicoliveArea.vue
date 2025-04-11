<template>
  <div class="root">
    <button
      @click="onToggle"
      class="nicolive-area-toggle-button"
      :class="{ 'nicolive-area--opened': opened }"
      v-if="!isCompactMode"
    >
      <i class="icon-drop-down-arrow"></i>
    </button>
    <div class="nicolive-area-container" v-if="opened || isCompactMode">
      <div class="program-area" :class="{ isCreate: !hasProgram }">
        <template v-if="hasProgram">
          <program-info class="program-area-item" />
          <program-statistics class="program-area-item" />
          <area-switcher class="switch-area" :contents="contents">
            <template v-slot:commentViewer
              ><comment-viewer :showPlaceholder="showPlaceholder"
            /></template>
            <template v-slot:description><program-description /></template>
          </area-switcher>
          <tool-bar class="program-area-item" />
          <div class="footer performance-metrics" v-if="isCompactMode">
            <div class="flex flex--center flex--grow flex--justify-start">
              <performance-metrics />
            </div>
          </div>
        </template>
        <template v-else>
          <p class="message">
            <i class="icon-namaco"></i>
            このエリアではニコニコ生放送を<br />配信するための機能が利用できます
          </p>
          <div class="button-wrapper">
            <button
              class="button button--primary button--create-program"
              @click="createProgram"
              :disabled="isCreating"
              v-if="!isCompactMode"
            >
              新しく番組を作成する
            </button>
            <div class="devider" v-if="!isCompactMode">
              <span class="devider-label">または</span>
            </div>
            <button
              class="button button--fetch-program"
              @click="fetchProgram"
              :disabled="isFetching"
              :class="[isCompactMode ? 'button--primary' : 'button--secondary']"
            >
              作成済みの番組を取得する
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script lang="ts" src="./NicoliveArea.vue.ts"></script>
<style lang="less" scoped>
@import url('../../styles/index');

.root {
  display: flex;
  height: 100%;
}

.nicolive-area-toggle-button {
  .dividing-border(left);
  .dividing-border(right);

  width: 24px;
  background-color: var(--color-bg-primary);

  > i {
    display: block;
    font-size: @font-size2;
    color: var(--color-text);
    transform: rotate(90deg);
  }

  &:hover {
    > i {
      color: var(--color-text-light);
    }
  }

  &.nicolive-area--opened {
    > i {
      transform: rotate(-90deg);
    }
  }
}

.nicolive-area-container {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  align-items: center;
  width: @nicolive-area-width;
  background-color: var(--color-bg-quinary);
}

.program-area {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  justify-content: center;
  width: 100%;

  &.isCreate {
    align-items: center;
    padding: 16px;
  }
}

.message {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 24px;
  font-size: @font-size4;
  line-height: 24px;
  color: var(--color-text);
  text-align: center;

  i {
    margin-bottom: 16px;
    font-size: 88px;
    color: var(--color-text-dark);
  }
}

.program-area-item {
  flex-shrink: 0;
}

.button-wrapper {
  display: flex;
  flex-direction: column;
  min-width: 200px;
  padding-bottom: 80px;

  .button {
    width: 100%;

    & + .button {
      margin-top: 16px;
    }
  }
}

.switch-area {
  flex-basis: 0;
  flex-grow: 1;
}

.devider {
  display: flex;
  align-items: center;
  margin: 16px 0;

  .devider-label {
    padding: 0 8px;
    font-size: @font-size2;
    color: var(--color-text-dark);
  }

  &::before,
  &::after {
    flex-grow: 1;
    height: 1px;
    content: '';
    background-color: var(--color-text-dark);
  }
}

.footer {
  .dividing-border;

  position: relative;
  display: flex;
  flex: 0 0 auto;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  max-width: none;
  height: 32px;
  padding: 0 16px;
  background-color: var(--color-bg-secondary);
}
</style>
