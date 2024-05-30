<template>
  <div
    :data-test="testingAnchor"
    :data-test-value="currentValue && currentValue.value"
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
        :internal-search="internalSearch"
        track-by="value"
        :close-on-select="true"
        :allow-empty="allowEmpty"
        :placeholder="placeholder || $t('settings.listPlaceholder')"
        :loading="loading"
        label="description"
        @input="onInputHandler"
        @search-change="onSearchChange"
      >
        <template slot="option" slot-scope="props">
          <span :data-test="`${props.option.value}`">
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

<script lang="ts" src="./ObsListInput.vue.ts"></script>
