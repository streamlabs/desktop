<template>
  <modal-layout :done-handler="done" :cancel-handler="cancel">
    <div slot="content">
      <ObsListInput v-model="form.type" @input="setTypeAsName"></ObsListInput>
      <ObsTextInput v-model="form.name"></ObsTextInput>
      <p v-if="error" style="color: red">
        {{ error }}
      </p>
    </div>
  </modal-layout>
</template>

<script lang="ts" src="./AddSourceFilter.vue.ts"></script>
