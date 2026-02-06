<template>
  <modal-layout v-if="widget.previewSourceId" ref="modal" :show-controls="false" :custom-controls="true">
    <div class="container" slot="content">
      <div class="top-settings" v-if="properties">
        <generic-form :value="topProperties" @input="onPropsInputHandler" />

        <div class="ant-alert ant-alert-info" role="alert" v-if="shouldShowAlertboxSwitcher">
          <div class="ant-alert-content">
            <div
              class="ant-alert-message"
              v-if="props.isAlertBox"
              style="cursor: pointer"
              @click="switchToNewAlertboxUI()"
            >
              {{ $t('Try the new simplified AlertBox settings') }}
            </div>
          </div>
        </div>
        <div v-if="apiSettings.testers" class="button button--action test-button">
          <test-widgets />
        </div>
      </div>

      <div class="window-container">
        <div class="editor-tabs" :class="{ pushed: props.isAlertBox }">
          <i v-if="isSaving" class="fa fa-spinner fa-pulse saving-indicator" />
          <tabs
            :hideContent="true"
            className="widget-editor__top-tabs"
            :tabs="topTabs"
            @input="value => updateTopTab(value)"
            :value="currentTopTab"
          />
          <div class="custom-code" v-if="loaded" :class="{ hidden: currentTopTab !== 'code' }">
            <toggle-input :value="customCodeIsEnabled" @input="value => toggleCustomCode(value)" />
            <span>{{ $t('Enable Custom Code') }}</span>
          </div>
          <div
            class="custom-code__alert"
            :class="{ active: customCodeIsEnabled }"
            v-if="topTabs.length > 1"
          />
        </div>

        <div
          class="content-container"
          :class="{ vertical: currentTopTab === 'code', 'has-leftbar': props.isAlertBox }"
        >
          <div class="display">
            <display
              v-if="!animating"
              :componentProps="{
                sourceId: widget.previewSourceId,
                clickHandler: e => createProjector(e),
              }"
            />
          </div>
          <div class="sidebar">
            <div
              class="subsection"
              v-if="props.slots"
              v-for="slot in props.slots"
              :key="slot.value"
            >
              <h2 class="subsection__title">{{ slot.label }}</h2>
              <div class="subsection__content custom"><slot :name="slot.value" /></div>
            </div>
            <div class="subsection">
              <h2 class="subsection__title">{{ $t('Sources and Settings') }}</h2>
              <scrollable
                class="os-host-flexbox"
                style="margin: 0"
                :isResizable="false"
                :autoSizeCapable="true"
              >
                <li
                  class="settings-title"
                  v-for="setting in props.navItems"
                  :class="{ active: currentSetting === setting.value }"
                  :key="setting.value"
                  @click="updateCurrentSetting(setting.value)"
                >
                  {{ setting.label }}
                </li>
              </scrollable>
            </div>
            <div class="subsection">
              <h2 class="subsection__title">{{ $t('Selected Properties') }}</h2>
              <scrollable className="subsection__content" v-if="currentSetting !== 'source'">
                <slot :name="`${currentSetting}-properties`" v-if="!loadingFailed" />
                <div v-else>
                  <div>{{ $t('Failed to load settings') }}</div>
                  <button class="button button--warn retry-button" @click="retryDataFetch()">
                    {{ $t('Retry') }}
                  </button>
                </div>
              </scrollable>
              <scrollable className="subsection__content" v-if="currentSetting === 'source'">
                <generic-form :value="sourceProperties" @input="onPropsInputHandler" />
              </scrollable>
            </div>
          </div>

          <div class="code-editor" v-if="loaded && customCodeIsEnabled && !loadingFailed">
            <tabs
              :hideConent="true"
              :tabs="codeTabs"
              v-model="currentCodeTab"
              @input="value => updateCodeTab(value)"
            />
            <code-editor
              v-if="canShowEditor && apiSettings.customCodeAllowed && currentCodeTab === 'HTML'"
              key="html"
              class="code-tab"
              :value="wData"
              :metadata="{ type: 'html', selectedId, selectedAlert }"
            />
            <code-editor
              v-if="canShowEditor && apiSettings.customCodeAllowed && currentCodeTab === 'CSS'"
              key="css"
              class="code-tab"
              :value="wData"
              :metadata="{ type: 'css', selectedId, selectedAlert }"
            />
            <code-editor
              v-if="canShowEditor && apiSettings.customCodeAllowed && currentCodeTab === 'JS'"
              key="js"
              class="code-tab"
              :value="wData"
              :metadata="{ type: 'js', selectedId, selectedAlert }"
            />
            <custom-fields-editor
              v-if="
                canShowEditor &&
                apiSettings.customFieldsAllowed &&
                currentCodeTab === 'customFields'
              "
              key="customFields"
              class="code-tab"
              :value="wData"
              :metadata="{ selectedId, selectedAlert }"
            />
          </div>
          <div v-else-if="customCodeIsEnabled && loadingFailed" style="padding: 8px">
            <div>{{ $t('Failed to load settings') }}</div>
            <button class="button button--warn retry-button" @click="retryDataFetch()">
              {{ $t('Retry') }}
            </button>
          </div>
        </div>

        <scrollable v-if="props.isAlertBox" className="left-toolbar"
          ><slot name="leftbar"
        /></scrollable>
      </div>
    </div>
    <div class="widget-controls" slot="controls">
      <div class="widget-controls__extra">
        <button class="button button--trans button--ghost" @click="openWebSettings()">
          <i class="icon-pop-out-2" />
          {{ $t('Manage on Web') }}
        </button>
      </div>
      <button class="button button--default" @click="$refs.modal.cancel()">
        {{ $t('Cancel') }}
      </button>
      <button class="button button--action" @click="$refs.modal.done()">
        {{ $t('Done') }}
      </button>
    </div>
  </modal-layout>
</template>

<script lang="ts" src="./WidgetEditor.vue.ts"></script>

<style lang="less">
@import '../../styles/index';

.widget-editor__top-tabs {
  padding: 0 16px !important;
}

.top-settings {
  .row.alignable-input {
    width: 100px;
    flex-direction: column;

    .input-body {
      margin-left: 0;
    }

    .input-footer {
      display: none;
    }

    .checkbox label {
      width: 160px;
    }
  }
}

.subsection__content {
  flex: 1;

  .input-wrapper {
    width: 100%;
  }

  .input-label {
    width: 0;
    padding: 0;
  }
}

.test-button .link {
  color: var(--action-button-text);
}

.widget-controls {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: stretch;
  justify-content: flex-start;
  gap: 8px;

  &__extra {
    flex: 1;
    text-align: left;
  }

  .button--ghost {
    border-color: var(--paragraph);
  }
}
</style>

<style lang="less" scoped>
@import '../../styles/index';

.container {
  position: relative;
  height: 100%;
  width: 100%;
}

.window-container {
  .radius();
  .border();

  overflow: hidden;
  height: calc(~'100% - 66px');
}

.saving-indicator {
  .absolute(15px, 15px);
}

.top-settings {
  width: 100%;
  display: flex;
  align-items: center;

  > div,
  form {
    display: flex;
    align-items: center;
  }
}

.top-input {
  display: flex;
  position: relative;
  align-items: center;

  span {
    margin-left: 4px;
  }

  .number-input {
    width: 60px !important;
  }
}

.test-button {
  margin-left: auto;
}

.editor-tabs {
  position: relative;
}

.editor-tabs.pushed {
  right: 0;
  width: 80%;
  margin-left: auto;
}

.content-container {
  display: flex;
  width: 100%;
  height: calc(~'100% - 48px');
  position: relative;
  background-color: var(--section);
  overflow: hidden;

  .code-editor {
    transform: translate(0, 100%);
  }

  .display {
    transform: scale(0.7, 0.7) translate(-21.4%);
  }
}

.content-container.vertical {
  .sidebar {
    transform: translate(100%);
    transition-delay: 0ms;
  }

  .code-editor {
    transform: translate(0, 0);
    transition-delay: 300ms;
  }

  .display {
    transform: scale(1, 0.4) translate(0, -73%);
  }
}

.content-container.has-leftbar {
  .code-editor {
    width: 80%;
    right: 0;
  }

  .display {
    transform: scale(0.5, 0.5) translate(-10%);
  }
}

.content-container.has-leftbar.vertical {
  .display {
    transform: scale(0.8, 0.4) translate(12.7%, -75%);
  }
}

.left-toolbar {
  width: 20%;
  height: calc(~'100% - 66px');
  position: absolute;
  bottom: 8px;
  left: 0;
  border: 1px solid var(--border);
  background-color: var(--background);
}

.display {
  width: 100%;
  height: 100%;
  position: absolute;
  top: 0;
  left: 0;
  background-color: var(--section);
}

.sidebar {
  width: 30%;
  height: 100%;
  position: absolute;
  right: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-left: 1px solid var(--border);
  background-color: var(--background);
  transition-delay: 300ms;
}

.subsection {
  display: flex;
  flex-direction: column;
  flex-grow: 0;
  flex-shrink: 0;

  &:last-of-type {
    flex-shrink: 1;
    flex-grow: 1;
  }
}

.subsection:not(:first-of-type) .subsection__title {
  border-top: 1px solid var(--border);
}

.subsection__title {
  .padding-h-sides(2);
  .padding-v-sides();
  .margin-bottom(@0);

  width: 100%;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}

.subsection__content {
  .padding(2);

  width: 100%;
  min-width: 260px;
  height: 100%;

  @media (max-width: 1024px) {
    min-width: 0;
  }
}

.subsection__content.custom {
  padding: 8px;
  flex-grow: 1;
}

.source-property {
  display: flex;
}

.settings-title {
  .padding-h-sides(2);

  margin: 0;
  list-style: none;
  cursor: pointer;
  line-height: 32px;

  &:hover,
  &.active {
    background-color: var(--button);
  }

  &.active {
    color: var(--title);
  }
}

.code-editor {
  height: 60%;
  width: 100%;
  position: absolute;
  bottom: 0;
  border-top: 1px solid var(--border);
  background-color: var(--background);
}

.code-tab {
  height: calc(100% - 48px);
}

.custom-code {
  .margin-left();
  .padding-left();

  position: absolute;
  display: flex;
  top: 0;
  left: 225px;
  align-items: center;
  height: 24px;
  border-left: 1px solid var(--border);
  margin: 12px 0;

  span {
    .padding-left();
  }
}

.custom-code.hidden {
  left: 100px;
  opacity: 0;
  border-left: none;
  z-index: -1;
}

.custom-code__alert {
  border-radius: 100%;
  width: 6px;
  height: 6px;
  position: absolute;
  top: calc(~'50% - 3px');
  left: 210px;
  transform: translate(0, -50%);
  background-color: var(--button);
}

.custom-code__alert.active {
  background-color: var(--teal);
}

.retry-button {
  margin-top: 16px;
}
</style>
