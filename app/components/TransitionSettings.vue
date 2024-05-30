<template>
  <div>
    <ObsTextInput v-model="nameModel" />
    <ObsListInput v-model="typeModel" />
    <ObsIntInput v-model="durationModel" />

    <GenericForm v-model="properties" @input="saveProperties"></GenericForm>
  </div>
</template>

<script lang="ts" src="./TransitionSettings.vue.ts"></script>
