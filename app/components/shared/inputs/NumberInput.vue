<template>
  <span
    class="number-input"
    data-role="input"
    data-type="number"
    :data-name="options.name"
    :data-title="options.title"
    :class="{ 'full-width': options.fullWidth, disabled: options.disabled }"
  >
    <input
      type="text"
      ref="input"
      :placeholder="options.placeholder"
      :value="displayValue"
      @input="handleInput($event.target.value)"
      @mousewheel="onMouseWheelHandler"
      @blur="handleBlur"
      :name="options.uuid"
      v-validate="validate"
      :disabled="options.disabled"
    />
    <div v-if="options.isInteger" class="arrows">
      <div class="arrow arrow-up" @click="increment">
        <i class="fa fa-chevron-up"></i>
      </div>
      <div class="arrow arrow-down" @click="decrement">
        <i class="fa fa-chevron-down"></i>
      </div>
    </div>
  </span>
</template>

<script lang="ts" src="./NumberInput.vue.ts"></script>

<style lang="less" scoped>
@import '../../../styles/index';

.number-input {
  position: relative;
  display: block;

  .arrows {
    .absolute(0, 8px, 0, auto);
    transition: opacity 200ms;

    width: 30px;
    color: var(--icon);
    opacity: 0.7;
    cursor: pointer;

    &:hover {
      opacity: 1;
    }

    .arrow {
      display: flex !important;

      .fa {
        position: relative;
        font-size: 9px;
      }

      &:active {
        color: black;
      }

      &.arrow-up {
        .absolute(6px, 0, auto, auto);
      }

      &.arrow-down {
        .absolute(auto, 0, 6px, auto);
      }
    }
  }
}

.number-input.full-width {
  width: 100%;
  input {
    width: 100%;
  }
}

.number-input.disabled {
  opacity: 0.5;

  input {
    cursor: not-allowed;
  }
}
</style>
