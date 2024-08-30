<template>
  <div data-test="SceneSelector">
    <div class="studio-controls-top" v-if="!isCompactMode">
      <div class="scene-collections-wrapper">
        <DropdownMenu class="scene-collections__dropdown" :title="activeCollection.name">
          <div class="input-wrapper input-wrapper--search">
            <input
              class="input--search"
              type="text"
              :placeholder="$t('common.search')"
              v-model="searchQuery"
            />
          </div>
          <a class="link settings-link" @click="manageCollections">
            <i class="icon-settings" />
          </a>
          <div
            v-for="sceneCollection in sceneCollections"
            :key="sceneCollection.id"
            class="dropdown-menu__item"
            :class="{ active: activeId === sceneCollection.id }"
            @click="loadCollection(sceneCollection.id)"
          >
            {{ sceneCollection.name }}
          </div>
        </DropdownMenu>
      </div>

      <div class="studio-controls-top-sidebar">
        <i class="icon-add icon-btn" @click="addScene" data-test="Add" />
        <i class="icon-delete icon-btn" @click="removeScene" data-test="Remove" />
        <i class="icon-settings icon-btn" @click="showTransitions" data-test="Edit" />
      </div>
    </div>

    <selector
      class="studio-controls-selector"
      :items="scenes"
      :activeItems="activeSceneId ? [activeSceneId] : []"
      @select="makeActive"
      @sort="handleSort"
      @contextmenu="showContextMenu"
    />

    <help-tip :dismissable-key="helpTipDismissable">
      <div slot="title">
        {{ $t('scenes.sceneCollections') }}
      </div>
      <div slot="content">
        {{ $t('scenes.sceneCollectionSelectionDescription') }}
      </div>
    </help-tip>

    <help-tip :dismissable-key="scenePresetHelpTipDismissable">
      <div slot="title">
        {{ $t('scenes.scenePreset') }}
      </div>
      <div slot="content">
        {{ $t('scenes.scenePresetDescription') }}
      </div>
    </help-tip>
  </div>
</template>

<script lang="ts" src="./SceneSelector.vue.ts"></script>

<style lang="less" scoped>
@import url('../styles/index');

.scene-collections-wrapper {
  position: relative;
  display: flex;
  flex-grow: 1;
  align-items: center;
  width: 160px;
  margin-right: 16px;
}

.input-wrapper--search {
  .radius;

  width: calc(100% - 38px); // .settings-link + 余白のサイズを引く
  margin: 8px;

  &::after {
    color: var(--color-text);
  }
}

.settings-link {
  position: absolute;
  top: 18px;
  right: 8px;
  display: inline-block;
}

.scene-collections__dropdown {
  .text-ellipsis;

  display: flex;
  width: 100%;
}
</style>
