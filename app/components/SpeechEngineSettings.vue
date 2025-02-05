<template>
  <div class="setting-section">
    <div class="section">
      <div class="speech-engine-heading">
        <img src="../../media/images/listicon_nvoice.png" class="image" alt="" />
        <div class="text">
          <p class="speech-engine-heading-label">N Voice 琴詠ニア</p>
          <span class="speech-engine-heading-text"
            >ニコニコから生まれた素直な声が特徴の音声合成エンジン</span
          >
        </div>
      </div>
      <div class="speech-engine-body">
        <div class="input-label section-heading">
          <label>音声設定</label>
        </div>
        <div class="input-container">
          <div class="row">
            <div class="name">合成音の最大秒数</div>
            <div class="value">
              {{ maxTime }}<span v-if="maxTime == maxTimeDefault">（既定）</span>
            </div>
          </div>
          <div class="slider-wrapper">
            <VueSlider
              class="slider"
              :disabled="!enabled"
              :data="maxTimeCandidates"
              :height="4"
              v-model="maxTime"
              tooltip="hover"
              :lazy="true"
            />
            <button
              class="action-icon"
              data-size="lg"
              data-variant="light"
              data-radius="sm"
              data-color="secondary"
              :disabled="!enabled"
              @click="testSpeechPlay('nVoice')"
            >
              <i class="icon-speaker"></i>
            </button>
          </div>
          <button
            :disabled="!enabled"
            @click="resetNVoice"
            data-size="md"
            data-radius="sm"
            data-color="secondary"
            data-variant="light"
            class="basic-button"
          >
            設定リセット
          </button>
        </div>
      </div>
    </div>
    <div class="section">
      <div class="speech-engine-heading">
        <img src="../../media/images/listicon_windows.png" class="image" alt="" />
        <div class="text">
          <p class="speech-engine-heading-label">Windowsの音声合成</p>
          <span class="speech-engine-heading-text"
            >Windowsの設定で選択されている音声合成エンジン</span
          >
        </div>
      </div>
      <div class="speech-engine-body">
        <div class="input-label section-heading">
          <label>音声設定</label>
        </div>
        <div class="input-container">
          <div class="row">
            <div class="name">声の高さ</div>
            <div class="value">{{ pitch }}<span v-if="pitch == pitchDefault">（既定）</span></div>
          </div>
          <div class="slider-wrapper">
            <VueSlider
              class="slider"
              :disabled="!enabled"
              :data="pitchCandidates"
              :height="4"
              v-model="pitch"
              tooltip="hover"
              :lazy="true"
            />
            <button
              class="action-icon"
              data-size="lg"
              data-variant="light"
              data-radius="sm"
              data-color="secondary"
              :disabled="!enabled"
              @click="testSpeechPlay('webSpeech')"
            >
              <i class="icon-speaker"></i>
            </button>
          </div>
          <button
            :disabled="!enabled"
            @click="resetWindows"
            data-size="md"
            data-radius="sm"
            data-color="secondary"
            data-variant="light"
            class="basic-button"
          >
            設定リセット
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" src="./SpeechEngineSettings.vue.ts"></script>
<style lang="less" scoped>
@import url('../styles/index');

.section {
  padding: 0;
}

.speech-engine-heading {
  display: flex;
  gap: var(--spacing-lg);
  align-items: center;
  padding: var(--spacing-lg);
  border-bottom: 1px solid var(--color-border-emphasis-low);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}

.image {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-xl);
}

.text {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2xs);
}

.speech-engine-body {
  padding: var(--spacing-lg) var(--spacing-lg) var(--spacing-md);
}

.speech-engine-heading-label {
  z-index: 1;
  margin: 0 0 4px;
  font-size: @font-size4;
  font-weight: @font-weight-bold;
  color: var(--color-object-emphasis-high);
}

.speech-engine-heading-text {
  z-index: 1;
  font-size: @font-size2;
  color: var(--color-object-emphasis-medium);
  text-shadow: 0 0 4px rgba(@black, 0.25);
}

.section-heading {
  display: flex;
  width: 100%;
}

.section-heading-button {
  margin-left: auto;
}

.row {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
}

.name {
  flex-grow: 1;
  font-size: @font-size4;
  color: var(--color-object-emphasis-medium);
}

.value {
  display: flex;
  align-items: center;
  color: var(--color-object-emphasis-medium);
}

.speech-button {
  width: 100%;
}

.slider-wrapper {
  display: flex;
  gap: var(--spacing-sm);
  align-items: center;
  width: 100%;
  margin: var(--spacing-md) 0;
}
</style>
