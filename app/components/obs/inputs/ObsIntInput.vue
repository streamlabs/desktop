<template>
  <div
    :data-test="testingAnchor"
    class="input-container IntInput"
    :class="{ disabled: value.enabled == false }"
  >
    <div class="input-label">
      <label v-if="value.showDescription !== false">{{ value.description }}</label>
    </div>
    <div class="input-wrapper">
      <div class="int-input">
        <input
          ref="input"
          type="text"
          :value="value.value"
          @mousewheel="onMouseWheelHandler"
          :disabled="value.enabled == false"
          @change="updateValue($event.target.value)"
        />
        <div class="arrows" @mousewheel="onMouseWheelHandler">
          <div class="arrow arrow-up" @click="increment">
            <i class="icon-drop-up-arrow"></i>
          </div>
          <div class="arrow arrow-down" @click="decrement">
            <i class="icon-drop-down-arrow"></i>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" src="./ObsIntInput.vue.ts"></script>

<style lang="less">
@import url('../../../styles/index');

.int-input {
  position: relative;

  input {
    padding-right: 32px;
  }

  .arrows {
    .absolute(0, 8px, 0, auto);

    width: 30px;
    color: var(--color-text);
    cursor: pointer;
    .transition;

    .arrow {
      display: flex !important;

      i {
        position: relative;
        font-size: @font-size1;
      }

      &:hover {
        color: var(--color-text-light);
      }

      &:active {
        color: var(--color-text-active);
      }

      &.arrow-up {
        .absolute(6px, 4px, auto, auto);
      }

      &.arrow-down {
        .absolute(auto, 4px, 6px, auto);
      }
    }
  }
}
</style>
