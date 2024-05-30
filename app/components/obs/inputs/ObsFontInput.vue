<template>
  <div :data-test="testingAnchor">
    <div class="input-container">
      <div class="input-label"></div>
      <div class="input-wrapper">
        <div class="checkbox">
          <input type="checkbox" :checked="isGoogleFont" @change="setFontType" />
          <label>{{ $t('sources.useGoogleFont') }}</label>
        </div>
      </div>
    </div>
    <google-font-selector v-if="isGoogleFont" :value="googleFont" @input="setGoogleFont" />
    <system-font-selector v-else :value="value" @input="setFont" />
  </div>
</template>

<script lang="ts" src="./ObsFontInput.vue.ts"></script>
