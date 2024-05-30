<template>
  <modal-layout
    :title="windowTitle"
    :done-handler="done"
    :cancel-handler="cancel"
    :fixedSectionHeight="200"
  >
    <display slot="fixed" v-if="source" :sourceId="source.id" />
    <div slot="content">
      <component
        v-if="propertiesManagerUI"
        :is="propertiesManagerUI"
        :source="source"
        @update="refresh"
      />
      <GenericForm v-model="properties" @input="onInputHandler" />
    </div>
  </modal-layout>
</template>

<script lang="ts" src="./SourceProperties.vue.ts"></script>
