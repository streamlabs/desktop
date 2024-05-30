<template>
  <div>
    <codemirror
      :value="value"
      :options="editorOptions[metadata.type]"
      @input="value => emitInput(value)"
    />
  </div>
</template>

<script lang="ts" src="./CodeInput.vue.ts"></script>

<style lang="less">
@import url('~codemirror/theme/material.css');
@import url('~codemirror/lib/codemirror.css');

.CodeMirror {
  min-height: 425px;
  font-size: 10pt;
}
</style>
