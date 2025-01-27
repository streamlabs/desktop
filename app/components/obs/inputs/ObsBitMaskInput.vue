<template>
  <div
    :data-test="testingAnchor"
    class="input-container"
    :class="{ disabled: value.enabled == false }"
  >
    <div class="input-label" v-if="value.showDescription !== false">
      <label>{{ value.description }}</label>
    </div>
    <div class="input-wrapper">
      <div class="bit-mask-input">
        <div v-for="(flag, index) in flags" :key="index" class="checkbox">
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
  </div>
</template>

<script lang="ts" src="./ObsBitMaskInput.vue.ts"></script>

<style lang="less" scoped>
.input-wrapper {
  width: auto;
}

.bit-mask-input {
  display: flex;
  flex-wrap: wrap;
}

.checkbox {
  width: auto;
  margin-right: 15px;
}
</style>
