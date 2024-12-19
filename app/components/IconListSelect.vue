<template>
  <multiselect
    v-model="model"
    :options="options"
    :allow-empty="false"
    :searchable="false"
    :placeholder="$t('settings.listPlaceholder')"
    :disabled="disabled"
    :loading="loading"
  >
    <template slot="singleLabel" slot-scope="p">
      <div class="voption">
        <img :src="p.option.icon" />
        <span>{{ p.option.name }}</span>
      </div>
    </template>
    <template slot="option" slot-scope="p">
      <div class="voption">
        <img :src="p.option.icon" />
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
  height: 24px;
  margin-right: 8px;
}
</style>
<script lang="ts" src="./IconListSelect.vue.ts"></script>
<style lang="less" scoped>
@import url('../styles/index');
@item-height: 36px;

.multiselect {
  min-height: @item-height;
}

/deep/ .multiselect__select {
  line-height: @item-height;
}

/deep/ .multiselect__single,
.multiselect__placeholder {
  width: 100%;
  height: @item-height;
  line-height: @item-height;
}

/deep/ .multiselect__single {
  .voption span {
    height: 100%;

    .text-ellipsis;
  }
}

/deep/ .multiselect__option {
  height: @item-height;
  line-height: @item-height;
}
</style>
