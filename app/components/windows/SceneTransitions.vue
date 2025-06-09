<template>
  <modal-layout
    bare-content
    no-scroll
    :content-styles="{ padding: 0 }"
    :show-cancel="false"
    :done-handler="done"
  >
    <div slot="content">
      <div v-if="!transitionsEnabled" class="transition-blank">
        {{ $t('transitions.mustHaveLeastTwoScenes') }}
      </div>
      <tabs :tabs="tabs" v-model="selectedTab" v-else>
        <div slot="transitions" class="transition-tab">
          <button class="button button--primary" @click="addTransition">
            {{ $t('transitions.addTransition') }}
          </button>
          <div class="table-wrapper">
            <table>
              <tr>
                <th>{{ $t('transitions.default') }}</th>
                <th>{{ $t('transitions.transitionName') }}</th>
                <th>{{ $t('transitions.transitionType') }}</th>
                <th class="table__controls"></th>
                <!-- Controls has no header -->
              </tr>
              <tr v-for="transition in transitions" :key="transition.id">
                <td class="transition-default-selector" @click="makeDefault(transition.id)">
                  <i
                    v-if="defaultTransitionId === transition.id"
                    class="icon-check transition-default"
                  />
                </td>
                <td>{{ transition.name }}</td>
                <td>{{ nameForType(transition.type) }}</td>
                <td class="table__controls">
                  <i
                    @click="deleteTransition(transition.id)"
                    class="icon-delete transition-control"
                  />
                  <i @click="editTransition(transition.id)" class="icon-edit transition-control" />
                </td>
              </tr>
            </table>
          </div>
        </div>
        <div slot="connections" class="transition-tab">
          <button class="button button--primary" @click="addConnection">
            {{ $t('transitions.addConnection') }}
          </button>
          <div class="table-wrapper">
            <table>
              <tr>
                <th>{{ $t('transitions.connectionFrom') }}</th>
                <th>{{ $t('transitions.transitionName') }}</th>
                <th>{{ $t('transitions.connectionTo') }}</th>
                <th class="table__controls"></th>
                <!-- Controls has no header -->
              </tr>
              <tr v-for="connection in connections" :key="connection.id">
                <td>{{ getSceneName(connection.fromSceneId) }}</td>
                <td>{{ getTransitionName(connection.transitionId) }}</td>
                <td>{{ getSceneName(connection.toSceneId) }}</td>
                <td class="table__controls">
                  <i
                    @click="deleteConnection(connection.id)"
                    class="icon-delete transition-control"
                  />
                  <i @click="editConnection(connection.id)" class="icon-edit transition-control" />
                  <i
                    v-if="isConnectionRedundant(connection.id)"
                    class="icon-warning transition-redundant"
                    v-tooltip="redundantConnectionTooltip"
                  />
                </td>
              </tr>
            </table>
          </div>
        </div>
      </tabs>
      <modal name="transition-settings" :height="550">
        <div class="modal-layout transition-settings-modal">
          <div class="modal-layout-content">
            <div class="settings-container">
              <div class="section">
                <transition-settings :transition-id="inspectedTransition" />
              </div>
            </div>
          </div>
          <div class="modal-layout-controls">
            <button class="button button--primary" @click="dismissModal('transition-settings')">
              {{ $t('common.done') }}
            </button>
          </div>
        </div>
      </modal>
      <modal name="connection-settings" :height="550">
        <div class="modal-layout connection-settings-modal">
          <div class="modal-layout-content">
            <div class="settings-container">
              <div class="section">
                <connection-settings :connection-id="inspectedConnection" />
              </div>
            </div>
          </div>
          <div class="modal-layout-controls">
            <button class="button button--primary" @click="dismissModal('connection-settings')">
              {{ $t('common.done') }}
            </button>
          </div>
        </div>
      </modal>
    </div>
  </modal-layout>
</template>

<script lang="ts" src="./SceneTransitions.vue.ts"></script>

<style lang="less" scoped>
@import url('../../styles/index');

.noScroll > div {
  .flex__column;

  flex-grow: 1;
}

.controls {
  padding-top: 30px;
}

.transition-blank {
  padding: 50px;
  text-align: center;
}

.transition-tab {
  flex-grow: 1;
  padding: 16px;
  .flex__column;

  .button {
    flex-shrink: 0;
    margin-bottom: 16px;
    margin-left: auto;
  }
}

.transition-default {
  color: var(--color-text-active);
  vertical-align: middle;
}

.transition-default-selector {
  width: 90px;
  cursor: pointer;

  &:hover {
    :not(.transition-default) {
      color: @white;
    }
  }
}

.transition-control {
  margin-left: 8px;
  vertical-align: middle;
  cursor: pointer;
  .icon-hover();
}

.transition-redundant {
  color: @accent;
}

.transition-done {
  position: absolute;
  right: 16px;
  bottom: 0;
}

.table-wrapper {
  .radius;

  padding: 8px 0;
  overflow: auto;
  background-color: var(--color-bg-secondary);
}

table {
  margin-bottom: 0;
}

th,
td {
  padding: 8px 16px;
  text-align: left;
}

.modal-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--color-bg-quinary);
}

.modal-layout-content {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  height: 100%;
  padding: 0;
  overflow-x: hidden;
  overflow-y: auto;
}

.modal-layout-controls {
  .dividing-border(top);

  z-index: @z-index-default-content;
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: flex-end;
  text-align: right;
  background-color: var(--color-bg-primary);

  div {
    display: flex;
    justify-content: flex-end;
  }

  &:not(:empty) {
    padding: 16px;
  }

  .button {
    margin-left: 12px;
  }
}

.settings-container {
  flex-grow: 1;
  padding: 16px 8px 0 16px;
  margin: 0;
  overflow-x: auto;
  overflow-y: scroll;
}
</style>
