<template>
  <modal-layout
    :title="windowTitle"
    :disable-done="hasErrors"
    :done-handler="done"
    :cancel-handler="cancel"
    :fixedSectionHeight="200"
  >
    <display slot="fixed" v-if="source" :componentProps="{ sourceId: source.id }" />
    <div slot="content" v-if="source">
      <component
        v-if="propertiesManagerUI"
        :is="propertiesManagerUI"
        :source="source"
        @update="refresh"
      />
      <GenericForm v-model="properties" @input="onInputHandler" @validate="onValidateHandler" />
    </div>
  </modal-layout>
</template>

<script lang="ts" src="./SourceProperties.vue.ts"></script>
