<template>
  <div :data-test="testingAnchor" class="input-container">
    <div class="input-label">
      <label>{{ $t('settings.fontSize') }}</label>
    </div>
    <div class="input-wrapper">
      <multiselect
        class="multiselect--font"
        :value="value"
        :options="fontSizePresets"
        :close-on-select="true"
        :allow-empty="false"
        @input="setFontSizePreset"
      >
        <template slot="option" slot-scope="props">
          <span>
            {{ props.option }}
          </span>
        </template>
        <template slot="noResult">
          {{ $t('settings.itemNotFoundMessage') }}
        </template>
      </multiselect>
    </div>
  </div>
</template>

<script lang="ts" src="./ObsFontSizeSelector.vue.ts"></script>
