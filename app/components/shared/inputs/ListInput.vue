<template>
  <div
    class="list-input"
    data-role="input"
    data-type="list"
    :data-name="options.name"
    :data-value="currentMultiselectValue ? currentMultiselectValue.value : ''"
    :data-option-title="currentMultiselectValue ? currentMultiselectValue.title : ''"
    :data-loading="options.loading"
    :class="{ 'full-width': options.fullWidth, disabled: options.disabled }"
    :data-internal-search="options.internalSearch"
  >
    <label>{{ title }}</label>
    <multiselect
      :value="currentMultiselectValue"
      :options="options.options"
      track-by="value"
      :close-on-select="true"
      :placeholder="placeholder"
      label="title"
      :allow-empty="options.allowEmpty"
      :internal-search="options.internalSearch"
      :loading="options.loading"
      :disabled="options.disabled"
      :allow-custom="options.allowCustom"
      :taggable="options.taggable"
      :open-direction="options.openDirection || ''"
      :max-height="options.optionsHeight"
      @input="onInputHandler"
      @search-change="onSearchChangeHandler"
      @open="handleOpen && handleOpen()"
      selectLabel=""
      selectedLabel=""
      deselectLabel=""
    >
      <span
        slot="option"
        slot-scope="itemProps"
        :data-option-value="itemProps.option.value"
        :data-option-title="itemProps.option.title"
      >
        <slot name="item" :option="itemProps.option">
          <img
            v-if="getImage(itemProps.option)"
            :src="getImage(itemProps.option)"
            alt=""
            class="image"
            :style="iconSizeStyle"
          />
          <div
            v-if="itemProps.showImagePlaceholder && !itemProps.option.image"
            class="image-placeholder"
            :style="iconSizeStyle"
          />
          {{ itemProps.option.title }}</slot
        >
      </span>

      <template slot="singleLabel" slot-scope="itemProps">
        <img
          v-if="getImage(itemProps.option)"
          :src="getImage(itemProps.option)"
          alt=""
          class="image"
        />
        <div
          v-if="props.showImagePlaceholder && !getImage(itemProps.option)"
          class="image-placeholder"
        />
        {{ itemProps.option.title }}
      </template>
      <template v-if="options.noResult" slot="noResult">{{ options.noResult }}</template>
      <template slot="noOptions">{{ $t('List is empty') }}</template>
      <template v-if="options.loading" slot="afterList"><spinner /></template>
    </multiselect>
    <div v-if="selectedOption && selectedOption.description" class="description">
      {{ selectedOption.description }}
    </div>
  </div>
</template>

<script lang="ts" src="./ListInput.vue.ts"></script>

<style lang="less" scoped>
@import '../../../styles/index';

.list-input.full-width {
  width: 100%;
}

.list-input.disabled {
  cursor: not-allowed;
}

.description {
  margin-top: 6px;
  font-size: 11px;
  font-style: italic;
}

.image,
.image-placeholder {
  display: inline-block;
  width: 16px;
  height: 16px;
  .margin-right(1);
}
</style>
