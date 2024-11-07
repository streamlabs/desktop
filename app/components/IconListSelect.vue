<template>
  <multiselect
    v-model="model"
    :options="options"
    :allow-empty="false"
    :searchable="false"
    :placeholder="$t('settings.listPlaceholder')"
    :disabled="disabled"
  >
    <template slot="singleLabel" slot-scope="p">
      <div class="voption">
        <img :src="p.option.icon" style="height: 32px" />
        <span>{{ p.option.name }}</span>
      </div>
    </template>
    <template slot="option" slot-scope="p">
      <div class="voption">
        <img :src="p.option.icon" style="height: 32px" />
        <span>{{ p.option.name }}</span>
      </div>
    </template>
  </multiselect>
</template>

<style scoped>
.voption {
  display: flex;
  align-items: center;
}

.voption img {
  margin-right: 8px;
}
</style>
<script lang="ts" src="./IconListSelect.vue.ts"></script>
