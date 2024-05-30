<template>
  <modal-layout bare-content :show-controls="false">
    <div slot="content" class="add-source" data-test="SourcesShowCase">
      <add-source-info v-if="inspectedSource === 'image_source'" sourceType="image_source" key="1">
        <imageSourceIcon slot="media" />
      </add-source-info>

      <add-source-info v-if="inspectedSource === 'slideshow'" sourceType="slideshow" key="2">
        <SlideshowIcon slot="media" />
      </add-source-info>

      <add-source-info
        v-if="inspectedSource === 'ffmpeg_source'"
        sourceType="ffmpeg_source"
        key="3"
      >
        <FfmpegSourceIcon slot="media" />
      </add-source-info>

      <add-source-info
        v-if="inspectedSource === 'window_capture'"
        sourceType="window_capture"
        key="4"
      >
        <WindowCaptureIcon slot="media" />
        <p slot="attention-text" class="attention">
          {{ $t('sources.windowCaptureMessage') }}
        </p>
      </add-source-info>

      <add-source-info v-if="inspectedSource === 'dshow_input'" sourceType="dshow_input" key="5">
        <MonitorCaptureIcon slot="media" />
      </add-source-info>

      <add-source-info
        v-if="inspectedSource === 'wasapi_output_capture'"
        sourceType="wasapi_output_capture"
        key="6"
      >
        <WasapiOutputIcon slot="media" />
      </add-source-info>

      <add-source-info v-if="inspectedSource === 'color_source'" sourceType="color_source" key="7">
        <ColorSourceIcon slot="media" />
      </add-source-info>

      <add-source-info
        v-if="inspectedSource === 'browser_source'"
        sourceType="browser_source"
        key="8"
      >
        <BrowserSourceIcon slot="media" />
      </add-source-info>

      <add-source-info v-if="inspectedSource === 'text_gdiplus'" sourceType="text_gdiplus" key="9">
        <TextGdiplusIcon slot="media" />
      </add-source-info>

      <add-source-info
        v-if="inspectedSource === 'monitor_capture'"
        sourceType="monitor_capture"
        key="10"
      >
        <DshowInputIcon slot="media" />
      </add-source-info>

      <add-source-info v-if="inspectedSource === 'game_capture'" sourceType="game_capture" key="11">
        <GameCaptureIcon slot="media" />
        <p slot="attention-text" class="attention">
          {{ $t('sources.gameCaptureMessage') }}
        </p>
      </add-source-info>

      <add-source-info
        v-if="inspectedSource === 'wasapi_input_capture'"
        sourceType="wasapi_input_capture"
        key="12"
      >
        <WasapiInputCaptureIcon slot="media" />
      </add-source-info>

      <add-source-info v-if="inspectedSource === 'ndi_source'" sourceType="ndi_source" key="13">
        <NdiSourceIcon slot="media" />
      </add-source-info>

      <add-source-info
        v-if="inspectedSource === 'decklink-input'"
        sourceType="decklink-input"
        key="14"
      >
        <BlackmagicSourceIcon slot="media" />
      </add-source-info>

      <add-source-info v-if="inspectedSource === 'scene'" sourceType="scene" key="15">
        <AddSceneIcon slot="media" />
      </add-source-info>

      <add-source-info v-if="inspectedSource === 'vlc_source'" sourceType="vlc_source" key="16">
        <VLCSourceIcon slot="media" />
      </add-source-info>

      <add-source-info
        v-if="inspectedSource === 'wasapi_process_output_capture'"
        sourceType="wasapi_process_output_capture"
        key="17"
      >
        <AppAudioCaptureSourceIcon slot="media" />
      </add-source-info>

      <add-source-info v-if="inspectedSource === 'near'" sourceType="near" key="18">
        <CharacterSourceIcon slot="media" />
      </add-source-info>

      <add-source-info
        v-if="inspectedSource === 'custom_cast_ndi_source'"
        sourceType="custom_cast_ndi_source"
        key="19"
      >
        <CharacterSourceIcon slot="media" />
      </add-source-info>

      <add-source-info
        v-if="inspectedSource === 'custom_cast_ndi_guide'"
        sourceType="custom_cast_ndi_guide"
        key="20"
      >
        <CharacterSourceIcon slot="media" />
        <p slot="attention-text" class="attention">
          {{ $t('sources.installNdiMessage') }}
          <button class="button button--secondary" @click="downloadNdiRuntime">
            {{ $t('sources.downloadNdiRuntime') }}
          </button>
        </p>
      </add-source-info>

      <add-source-info
        v-if="inspectedSource === 'nair-rtvc-source'"
        sourceType="nair-rtvc-source"
        key="21"
      >
        <SpeechEngineIcon slot="media" />
      </add-source-info>

      <div class="source-info" v-if="inspectedSource === null">
        <div class="source-info__text">
          <h3>{{ $t('sources.sourcesWelcomeMessage') }}</h3>
          <ol>
            <li>{{ $t('sources.addSourceProcess1') }}</li>
            <li>{{ $t('sources.addSourceProcess2') }}</li>
            <li>{{ $t('sources.addSourceProcess3') }}</li>
          </ol>
        </div>
        <div class="source-info__media">
          <AddFileIcon slot="media" />
        </div>
      </div>

      <div class="sources">
        <div class="source-group section">
          <ul class="source-list">
            <li
              v-for="source in availableSources"
              class="source source--standard button--border"
              :class="{ active: inspectedSource === source.value }"
              :data-test="`${source.value}`"
              :key="source.value"
              @click="inspectSource(source.value)"
              @dblclick="selectSource(source.value)"
            >
              {{ $t(`source-props.${source.value}.name`) }}
            </li>
          </ul>
        </div>
      </div>

      <div class="modal-layout-controls bottom-sticky">
        <button
          @click="selectInspectedSource()"
          class="button button--primary"
          :disabled="!readyToAdd"
          data-test="AddSource"
        >
          {{ $t('sources.addSourceButton') }}
        </button>
      </div>
    </div>
  </modal-layout>
</template>

<script lang="ts" src="./SourcesShowcase.vue.ts"></script>

<style lang="less">
@import url('../../styles/index');

.source-info {
  position: relative;
  display: flex;
  flex: 0 0 180px;
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  height: 180px;
  padding: 0 24px;
  margin: 16px 16px 0;
  overflow: hidden;
  background-color: var(--color-bg-tertiary);
}

.source-info__text {
  z-index: @z-index-default-content;
  max-width: 440px;

  h3,
  .desc {
    margin-bottom: 8px;
  }

  h3 {
    display: flex;
    align-items: center;
    font-size: @font-size6;

    svg {
      width: 20px;
      height: 20px;
      margin-right: 8px;
    }
  }

  ol {
    margin-bottom: 0;
  }

  .desc {
    color: var(--color-text-light);
    white-space: pre-wrap;
  }
}
</style>

<style lang="less" scoped>
@import url('../../styles/index');

.source-support__list {
  > h3 {
    font-size: @font-size6;
    color: var(--color-text-light);
  }

  ol {
    margin-bottom: 0;
  }
}

.add-source {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  color: var(--color-text);
}

.sources {
  display: flex;
  padding: 0 16px;
  overflow: hidden;
}

.source-group {
  flex: 0 0 100%;
  overflow-y: auto;
}

.source-list {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  margin: 0;
  list-style-type: none;
}

.source {
  min-width: calc((100% - 16px * 2) / 3);
  padding: 8px;
  margin-bottom: 16px;
  text-align: center;
  cursor: pointer;
  border-radius: 4px;
  .transition;

  &:hover,
  &.source--active {
    color: var(--color-text-light);
  }

  > div {
    .text-ellipsis;

    display: inline-block;
    max-width: 100%;
  }
}

.source--standard {
  display: inline-block;
}

.source-info__media {
  display: flex;
  align-content: center;
  align-items: center;
  justify-content: center;
  margin: 0 8px 0 auto;
  text-align: center;

  svg {
    width: 120px;
    height: 120px;
    color: var(--color-text-dark);
  }

  [data-type='near'] &,
  [data-type='custom_cast_ndi_guide'] & {
    display: none;
  }
}

.attention {
  padding-right: 16px;
  margin-bottom: 0;
  font-size: @font-size2;
  color: var(--color-text-light);

  .button {
    margin-top: 8px;
  }
}

// .bottom-sticky {
//   position: sticky;
//   bottom: 0;
// }
</style>
