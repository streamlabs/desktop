<template>
  <div :data-test="testingAnchor">
    <div class="input-container">
      <div class="input-label">
        <label>{{ $t('settings.fontFamily') }}</label>
      </div>
      <div class="input-wrapper">
        <multiselect
          ref="family"
          class="multiselect--font"
          :value="selectedFamily"
          :options="fontFamilies"
          :allow-empty="false"
          track-by="family"
          label="family"
          @input="setFamily"
        >
          <template slot="option" slot-scope="props">
            <span :style="{ fontFamily: props.option.family }">
              {{ props.option.family }}
            </span>
          </template>
          <template slot="noResult">
            {{ $t('settings.itemNotFoundMessage') }}
          </template>
        </multiselect>
      </div>
    </div>
    <div class="input-container">
      <div class="input-label">
        <label>{{ $t('settings.fontStyle') }}</label>
      </div>
      <div class="input-wrapper">
        <multiselect
          ref="font"
          class="multiselect--font"
          :value="selectedFont"
          :options="selectedFamily.fonts"
          :allow-empty="false"
          track-by="style"
          label="style"
          @input="setStyle"
        >
          <template slot="option" slot-scope="props">
            <span :style="styleForFont(props.option)">
              {{ props.option.style }}
            </span>
          </template>
          <template slot="noResult">
            {{ $t('settings.itemNotFoundMessage') }}
          </template>
        </multiselect>
      </div>
    </div>
    <font-size-selector :value="value.value.size" @input="setSize" />
  </div>
</template>

<script lang="ts" src="./ObsSystemFontSelector.vue.ts"></script>

<style lang="less" scoped>
@import url('../../../styles/index');

.multiselect--font {
  margin-bottom: 0;
}

.FontProperty-presets {
  position: absolute;
  top: 0;
  right: 0;
  width: 0;
  cursor: pointer;
  background-color: rgba(0, 0, 0, 0%);
  border: 0;
  outline: none;
}
</style>
