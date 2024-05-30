<template>
  <div
    :data-test="testingAnchor"
    class="input-container"
    :class="{ disabled: value.enabled == false }"
  >
    <div class="input-label" v-if="value.showDescription !== false"></div>
    <div class="input-wrapper">
      <div v-for="(flag, index) in flags" class="checkbox">
        <input
          type="checkbox"
          :checked="flag"
          :disabled="value.enabled == false"
          @change="event => onChangeHandler(index, !!event.target['checked'])"
        />
        <label>{{ index + 1 }}</label>
      </div>
    </div>
  </div>
</template>

<script lang="ts" src="./ObsBitMaskInput.vue.ts"></script>

<style lang="less" scoped>
.input-wrapper {
  width: auto;
}

.checkbox {
  width: auto;
  margin-right: 15px;
}
</style>
