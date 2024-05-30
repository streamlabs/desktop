<template>
  <div :data-test="testingAnchor" class="google-font-selector">
    <div>
      <div class="input-container">
        <div class="input-label">
          <label>
            {{ $t('settings.fontFamily') }}
            <i v-if="loading" class="icon-spinner icon-spin google-font-loading" />
          </label>
        </div>
        <div class="input-wrapper">
          <multiselect
            :value="selectedFamily"
            :options="fontFamilies"
            :disabled="loading"
            @input="setFamily"
          >
          </multiselect>
        </div>
      </div>
      <div class="input-container">
        <div class="input-label">
          <label>
            {{ $t('settings.fontStyle') }}
            <i v-if="loading" class="icon-spinner icon-spin google-font-loading" />
          </label>
        </div>
        <div class="input-wrapper">
          <multiselect
            :value="selectedStyle"
            :options="fontStyles"
            :allow-empty="false"
            :disabled="loading"
            @input="setStyle"
          >
          </multiselect>
          <template slot="noResult">
            {{ $t('settings.itemNotFoundMessage') }}
          </template>
        </div>
      </div>
      <font-size-selector :value="value.size" @input="setSize" />
    </div>
  </div>
</template>

<script lang="ts" src="./ObsGoogleFontSelector.vue.ts"></script>

<style lang="less" scoped>
.google-font-loading {
  margin-left: 5px;
}

.icon-spin {
  animation: icon-spin 2s infinite linear;
}

@keyframes icon-spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(359deg);
  }
}
</style>
