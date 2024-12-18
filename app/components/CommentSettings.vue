<template>
  <div class="setting-section">
    <div class="section">
      <div class="input-label section-heading">
        <label>表示設定</label>
      </div>
      <div class="input-container">
        <div class="input-wrapper">
          <div class="row">
            <div class="name">匿名コメントを表示</div>
            <div class="value">
              <input type="checkbox" v-model="showAnonymous" class="toggle-button" />
            </div>
          </div>
        </div>
        <div class="input-wrapper">
          <div class="row">
            <div class="name">なふだを表示</div>
            <div class="value">
              <input type="checkbox" v-model="nameplateEnabled" class="toggle-button" />
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="section">
      <div class="input-label section-heading">
        <label>読み上げ設定</label>
      </div>
      <div class="input-container">
        <div class="input-wrapper">
          <div class="row">
            <div class="name">コメントを読み上げる</div>
            <div class="value">
              <input type="checkbox" v-model="synthesizerEnabled" class="toggle-button" />
            </div>
          </div>
        </div>
      </div>

      <div class="section" v-if="synthesizerEnabled">
        <div class="input-label section-heading">
          <label>音声設定</label>
        </div>
        <div class="input-container">
          <div class="input-wrapper">
            <div class="row">
              <div class="name">速度</div>
              <div class="value">×{{ rate }}<span v-if="rate == rateDefault">（既定）</span></div>
            </div>
            <VueSlider
              class="slider"
              :disabled="!synthesizerEnabled"
              :data="rateCandidates"
              :height="4"
              v-model="rate"
              tooltip="hover"
              :lazy="true"
            />
          </div>
          <div class="input-wrapper">
            <div class="row">
              <div class="name">音量</div>
              <div class="value">
                {{ volume }}<span v-if="volume == volumeDefault">（既定）</span>
              </div>
            </div>
            <VueSlider
              class="slider"
              :disabled="!synthesizerEnabled"
              :data="volumeCandidates"
              :height="4"
              :max="1"
              v-model="volume"
              tooltip="hover"
              :lazy="true"
            />
          </div>
        </div>
        <button
          :disabled="!synthesizerEnabled"
          @click="resetVoice"
          data-size="md"
          data-radius="sm"
          data-color="secondary"
          data-variant="light"
          class="basic-button"
        >
          設定リセット
        </button>
      </div>

      <div class="section" v-if="synthesizerEnabled">
        <div class="input-label section-heading">
          <label>振り分け設定</label>
        </div>
        <div class="input-container">
          <div v-if="voicevoxInformation" class="banner">
            <div class="banner-header">N Air上でVOICEVOXの音声が選択できるようになりました</div>
            <div class="banner-body">
              VOICEVOXを起動して、好きなキャラクターに読み上げてもらおう
            </div>
            <a class="banner-anchor" @click="showVoicevoxInformation()"
              >VOICEVOXで音声を読み上げるには<i class="icon-open-blank"></i
            ></a>
            <div class="banner-close">
              <i class="icon-close icon-btn" @click="closeVoicevoxInformation"></i>
            </div>
          </div>

          <div
            v-if="isUseVoicevox && !isExistVoicevox && !isLoadingVoicevox"
            class="banner"
            data-type="error"
          >
            <div class="banner-header">VOICEVOXを起動してください</div>
            <a class="banner-anchor" @click="showVoicevoxInformation()"
              >VOICEVOXで音声を読み上げるには<i class="icon-open-blank"></i
            ></a>
          </div>

          <!-- system -->
          <div class="input-label">
            <label :class="{ label_error: system.id == 'voicevox' && !isExistVoicevox }">
              システムメッセージ
            </label>
          </div>
          <div class="select-wrapper">
            <IconListSelect v-model="system" :options="synthesizers" data-variant="filled" />
            <IconListSelect
              v-if="system.id == 'voicevox'"
              v-model="voicevoxSystemItem"
              :options="voicevoxItems"
              :disabled="!isExistVoicevox"
              data-variant="filled"
            />
            <button
              class="action-icon"
              data-size="lg"
              data-variant="light"
              data-radius="sm"
              data-color="secondary"
              :disabled="!isTestable(system.id)"
              @click="testSpeechPlay(system.id, 'system')"
            >
              <i class="icon-speaker"></i>
            </button>
          </div>
          <!--normal -->
          <div class="input-label">
            <label :class="{ label_error: normal.id == 'voicevox' && !isExistVoicevox }">
              視聴者コメント
            </label>
          </div>
          <div class="select-wrapper">
            <IconListSelect v-model="normal" :options="synthesizers" data-variant="filled" />
            <IconListSelect
              v-if="normal.id == 'voicevox'"
              v-model="voicevoxNormalItem"
              :options="voicevoxItems"
              :disabled="!isExistVoicevox"
              data-variant="filled"
            />
            <button
              class="action-icon"
              data-size="lg"
              data-variant="light"
              data-radius="sm"
              data-color="secondary"
              :disabled="!isTestable(normal.id)"
              @click="testSpeechPlay(normal.id, 'normal')"
            >
              <i class="icon-speaker"></i>
            </button>
          </div>

          <!-- operator -->
          <div class="input-label">
            <label :class="{ label_error: operator.id == 'voicevox' && !isExistVoicevox }">
              放送者コメント
            </label>
          </div>
          <div class="select-wrapper">
            <IconListSelect v-model="operator" :options="synthesizers" data-variant="filled" />
            <IconListSelect
              v-if="operator.id == 'voicevox'"
              v-model="voicevoxOperatorItem"
              :options="voicevoxItems"
              :disabled="!isExistVoicevox"
              data-variant="filled"
            />
            <button
              class="action-icon"
              data-size="lg"
              data-variant="light"
              data-radius="sm"
              data-color="secondary"
              :disabled="!isTestable(operator.id)"
              @click="testSpeechPlay(operator.id, 'operator')"
            >
              <i class="icon-speaker"></i>
            </button>
          </div>
          <!-- end -->
          <button
            @click="resetAssignment"
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
      <div class="input-label section-heading">
        <label>HTTP連携設定</label>
      </div>
      <div class="input-container">
        <div class="input-wrapper">
          <div class="input-label">
            <label>Method</label>
          </div>
          <multiselect
            v-model="httpRelationMethod"
            :options="httpRelationMethods"
            label="text"
            trackBy="value"
            :allow-empty="false"
            :searchable="false"
            :placeholder="$t('settings.listPlaceholder')"
            data-variant="filled"
          >
          </multiselect>
        </div>

        <div class="input-wrapper" v-if="httpRelationMethod.value !== ''">
          <div class="input-label">
            <label>URL</label>
          </div>
          <input type="text" v-model="httpRelationUrl" />
        </div>
        <div
          class="input-wrapper"
          v-if="httpRelationMethod.value !== '' && httpRelationMethod.value !== 'GET'"
        >
          <div class="input-label">
            <label>Body</label>
          </div>
          <textarea rows="3" v-model="httpRelationBody"></textarea>
        </div>
        <div class="input-wrapper" v-if="httpRelationMethod.value !== ''">
          <button
            data-size="md"
            data-radius="sm"
            data-color="secondary"
            data-variant="light"
            class="basic-button"
            @click="testHttpRelation()"
          >
            テスト
          </button>
        </div>
        <div class="input-wrapper">
          詳細は<a @click="showHttpRelationPage()">こちら</a>を参照してください
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" src="./CommentSettings.vue.ts"></script>
<style lang="less" scoped>
@import url('../styles/index');

.section-item {
  padding: 16px;
}

.row {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
}

.input-heading {
  margin-bottom: 16px;

  .button {
    margin-bottom: 0;
    margin-left: auto;
  }
}

.slider-wrapper {
  margin-bottom: 32px;
}

.name {
  flex-grow: 1;
  font-size: @font-size4;
  color: var(--color-text);
}

.value {
  display: flex;
  align-items: center;
  color: var(--color-text);
}

.slider {
  margin-top: 8px;
}

.button {
  & + & {
    margin-left: 8px;
  }
}

.banner {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  padding: 12px 16px;
  margin-bottom: 16px;
  background-color: var(--color-surface-primary);
  border: 1px solid var(--color-border-emphasis-low);

  .radius;

  &[data-type='error'] {
    background-color: color-mix(in srgb, var(--color-caution-primary) 15%, transparent);
    border: none;
  }
}

.banner-header {
  .bold;

  padding-right: 16px;
  color: var(--color-object-emphasis-high);

  [data-type='error'] & {
    color: var(--color-caution-primary);
  }
}

.banner-body {
  color: var(--color-object-emphasis-medium);
}

.banner-anchor {
  display: flex;
  gap: 8px;
  align-items: center;
}

.banner-close {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;

  i {
    margin: 0;
  }
}

.label_error {
  color: var(--color-caution-primary);
}

.select-wrapper {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  margin-bottom: 16px;

  .multiselect {
    flex-grow: 1;
  }

  .action-icon {
    flex-shrink: 0;
  }
}
</style>
