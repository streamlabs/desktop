<template>
  <div>
    <!-- title -->
    <div class="form-group__title form-group__title--vertical">
      <label v-if="options.title">
        {{ options.title }}
      </label>
      <label v-else> &nbsp; </label>
      <div v-if="options.tooltip" class="tooltip">
        <i class="icon-question icon-btn" v-tooltip="metadata.tooltip" />
      </div>
    </div>

    <div>
      <!-- input(s) & whisper -->
      <form-input
        :value="value"
        :metadata="formInputMetadata"
        @input="(value, event) => emitInput(value, event)"
      />

      <div v-if="!type" class="slots">
        <slot></slot>
      </div>

      <div class="input-footer">
        <div class="whisper" v-if="options.description && !inputErrors.length">
          {{ options.description }}
        </div>
        <div class="input-error" v-if="inputErrors.length">
          {{ inputErrors[0].msg }}
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" src="./VFormGroup.vue.ts"></script>

<style lang="less" scoped>
@import '../../../styles/index';

.form-group__title {
  display: flex;
  align-items: center;
}

.form-group__title--vertical {
  .margin-bottom();
}

.slots {
  width: 100%;
}

.tooltip {
  .margin-left();

  position: relative;
  font-size: 14px;
  align-self: center;
  display: inline-block;
  z-index: @z-raised;
  color: var(--icon);
  line-height: 0;
}

.input-footer {
  margin-top: 6px;
  min-height: 16px;
  font-size: 11px;

  .whisper {
    font-style: italic;
  }
  .input-error {
    color: var(--warning);
  }
}
</style>
