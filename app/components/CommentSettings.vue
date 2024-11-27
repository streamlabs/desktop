<template>
  <div class="setting-section">
    <div class="section">
      <div class="input-label section-heading">
        <label>フィルター設定</label>
      </div>
      <div class="input-container">
        <div class="input-wrapper">
          <div class="row">
            <div class="name">匿名のコメントを表示</div>
            <div class="value">
              <input type="checkbox" v-model="showAnonymous" class="toggle-button" />
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="section">
      <div class="input-label section-heading">
        <label>コメント読み上げ設定</label>
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
    </div>
    <div class="section">
      <div class="input-label section-heading">
        <label>なふだ設定</label>
      </div>
      <div class="input-container">
        <div class="input-wrapper">
          <div class="row">
            <div class="name">コメントリストのなふだを表示</div>
            <div class="value">
              <input type="checkbox" v-model="nameplateEnabled" class="toggle-button" />
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="section" v-if="synthesizerEnabled">
      <div class="input-label section-heading">
        <label>音声設定</label>
        <button
          class="button--text section-heading-button"
          :disabled="!synthesizerEnabled"
          @click="resetVoice"
        >
          設定リセット
        </button>
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
    </div>
    <div class="section" v-if="synthesizerEnabled">
      <div class="input-label section-heading">
        <label>振り分け設定</label>
      </div>
      <div class="input-container">
        <div v-if="voicevoxInformation" class="comment_info_panel">
          <div style="font-weight: bold">N Air上でVOICEVOXの音声が選択できるようになりました</div>
          <div>VOICEVOXを起動して、好きなキャラクターに読み上げてもらおう</div>
          <div>
            <a @click="showVoicevoxInformation()">VOICEVOXで音声を読み上げるには</a>
          </div>
          <div style="position: absolute; top: 16px; right: 8px">
            <i class="icon-close icon-btn" @click="closeVoicevoxInformation"></i>
          </div>
        </div>

        <div
          v-if="isUseVoicevox && !isExistVoicevox && !isLoadingVoicevox"
          class="comment_error_panel"
        >
          <div style="font-weight: bold; color: #f27a7a">VOICEVOXを起動してください</div>
          <div>
            <a @click="showVoicevoxInformation()">VOICEVOXで音声を読み上げるには</a>
          </div>
        </div>

        <div class="input-wrapper">
          <!-- system -->
          <div class="comment_panel">
            <div class="comment_label">
              <span :class="{ comment_label_error: system.id == 'voicevox' && !isExistVoicevox }">
                システムメッセージ
              </span>
            </div>
            <div class="comment_list">
              <IconListSelect style="flex: 1" v-model="system" :options="synthesizers" />
              <IconListSelect
                v-if="system.id == 'voicevox'"
                style="flex: 1"
                v-model="voicevoxSystemItem"
                :options="voicevoxItems"
                :disabled="!isExistVoicevox"
              />
              <button
                class="flat_button"
                :disabled="!isTestable(system.id)"
                @click="testSpeechPlay(system.id, 'system')"
              >
                <i class="icon-speaker"></i>
              </button>
            </div>
          </div>
          <!--normal -->
          <div class="comment_panel">
            <div class="comment_label">
              <span :class="{ comment_label_error: normal.id == 'voicevox' && !isExistVoicevox }">
                視聴者コメント
              </span>
            </div>
            <div class="comment_list">
              <IconListSelect style="flex: 1" v-model="normal" :options="synthesizers" />
              <IconListSelect
                v-if="normal.id == 'voicevox'"
                style="flex: 1"
                v-model="voicevoxNormalItem"
                :options="voicevoxItems"
                :disabled="!isExistVoicevox"
              />
              <button
                class="flat_button"
                :disabled="!isTestable(normal.id)"
                @click="testSpeechPlay(normal.id, 'normal')"
              >
                <i class="icon-speaker"></i>
              </button>
            </div>
          </div>

          <!-- operator -->
          <div class="comment_panel">
            <div class="comment_label">
              <span :class="{ comment_label_error: operator.id == 'voicevox' && !isExistVoicevox }">
                放送者コメント
              </span>
            </div>
            <div class="comment_list">
              <IconListSelect style="flex: 1" v-model="operator" :options="synthesizers" />
              <IconListSelect
                v-if="operator.id == 'voicevox'"
                style="flex: 1"
                v-model="voicevoxOperatorItem"
                :options="voicevoxItems"
                :disabled="!isExistVoicevox"
              />
              <button
                class="flat_button"
                :disabled="!isTestable(operator.id)"
                @click="testSpeechPlay(operator.id, 'operator')"
              >
                <i class="icon-speaker"></i>
              </button>
            </div>
          </div>
          <!-- end -->
          <div class="comment_panel">
            <button @click="resetAssignment" class="flat_button">設定リセット</button>
          </div>
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
          >
          </multiselect>
        </div>

        <div class="input-wrapper"></div>

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
          <button class="button button--secondary" @click="testHttpRelation()">テスト</button>
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

.section-heading {
  display: flex;
  width: 100%;
}

.section-heading-button {
  margin-left: auto;
}

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
  margin-top: 16px;
}

.button {
  & + & {
    margin-left: 8px;
  }
}

.flat_button {
  padding: 10px;
  background-color: var(--color-bg-primary);

  &:disabled {
    opacity: 0.5;
  }
}

.comment_info_panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  padding: 16px;
  margin: 8px 0;
  background-color: var(--color-bg-primary);
  border: 1px solid var(--color-border-light);
  border-radius: 4px;
}

.comment_error_panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  padding: 16px;
  margin: 8px 0;
  background-color: #f27a7a24;
  border-radius: 4px;
}

.comment_panel {
  padding-top: 8px;
  padding-bottom: 8px;
}

.comment_label {
  padding: 8px 0;
}

.comment_label_error {
  color: #f27a7a;
}

.comment_list {
  display: flex;
  gap: 8px;
  align-items: center;
}
</style>
