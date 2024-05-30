<template>
  <div>
    <hotkey-group :hotkeys="hotkeySet.general" />
    <hotkey-group
      v-for="(scenesHotkeys, sceneId) in hotkeySet.scenes"
      :key="sceneId"
      :title="scenesService.getScene(sceneId).name"
      :hotkeys="scenesHotkeys"
    />
    <hotkey-group
      v-for="(sourceHotkeys, sourceId) in hotkeySet.sources"
      :key="sourceId"
      :title="sourcesService.getSource(sourceId).name"
      :hotkeys="sourceHotkeys"
    />
  </div>
</template>

<script lang="ts" src="./Hotkeys.vue.ts"></script>
