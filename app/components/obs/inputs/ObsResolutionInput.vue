<template>
  <div
    :data-test="testingAnchor"
    class="input-container select"
    :class="{ disabled: value.enabled === false }"
  >
    <div v-if="value.showDescription !== false" class="input-label">
      <label>{{ value.description }}</label>
    </div>
    <div class="input-wrapper">
      <multiselect
        :value="currentValue"
        :disabled="value.enabled === false"
        :options="value.options"
        track-by="value"
        :close-on-select="true"
        :placeholder="placeholder || $t('settings.resolutionPlaceholder')"
        :allow-custom="getCustomResolution"
        :allow-empty="false"
        label="description"
        @input="onInputHandler"
        @search-change="onSearchChange"
      >
        <template slot="option" slot-scope="props">
          <span>
            {{ props.option.description }}
          </span>
        </template>
        <template slot="noResult">
          {{ $t('settings.itemNotFoundMessage') }}
        </template>
      </multiselect>
    </div>
  </div>
</template>

<script lang="ts" src="./ObsResolutionInput.vue.ts"></script>
