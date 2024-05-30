<template>
  <form :data-vv-scope="validationScopeId" @submit.prevent="$emit('submit')">
    <slot></slot>
  </form>
</template>

<script lang="ts" src="./ValidatedForm.vue.ts"></script>
