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
              <input type="checkbox" v-model="enabled" class="toggle-button" />
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
    <div class="section">
      <div class="input-label section-heading">
        <label>音声設定</label>
        <button
          class="button--text section-heading-button"
          :disabled="!enabled"
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
            :disabled="!enabled"
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
            :disabled="!enabled"
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
    <div class="section">
      <div class="input-label section-heading">
        <label>振り分け設定</label>
        <button
          class="button--text section-heading-button"
          :disabled="!enabled"
          @click="resetAssignment"
        >
          設定リセット
        </button>
      </div>
      <div class="input-container">
        <div class="input-wrapper voice">
          <div class="row input-label">
            <label for="system-select">システムメッセージ</label>
            <button
              class="button button--secondary"
              :disabled="!enabled"
              @click="testSpeechPlay(system)"
            >
              <i class="icon-speaker"></i>
              読み上げテスト
            </button>
          </div>
          <multiselect
            class="voice"
            id="system-select"
            v-model="system"
            :options="synthIds"
            :allow-empty="false"
            :custom-label="synthName"
            :placeholder="$t('settings.listPlaceholder')"
            :data-type="system"
          >
            <template slot="option" slot-scope="o">
              {{ synthName(o.option) }}<span v-if="o.option == systemDefault">（既定）</span>
            </template>
          </multiselect>
        </div>
      </div>
      <div class="input-container">
        <div class="input-wrapper voice">
          <div class="row input-label">
            <label for="normal-select">視聴者コメント</label>
            <button
              class="button button--secondary"
              :disabled="!enabled"
              @click="testSpeechPlay(normal)"
            >
              <i class="icon-speaker"></i>
              読み上げテスト
            </button>
          </div>
          <multiselect
            id="normal-select"
            v-model="normal"
            :options="synthIds"
            :allow-empty="false"
            :custom-label="synthName"
            :placeholder="$t('settings.listPlaceholder')"
            :data-type="normal"
          >
            <template slot="option" slot-scope="o">
              {{ synthName(o.option) }}<span v-if="o.option == normalDefault">（既定）</span>
            </template>
          </multiselect>
        </div>
      </div>
      <div class="input-container">
        <div class="input-wrapper voice">
          <div class="row input-label">
            <label for="operator-select">放送者コメント</label>
            <button
              class="button button--secondary"
              :disabled="!enabled"
              @click="testSpeechPlay(operator)"
            >
              <i class="icon-speaker"></i>
              読み上げテスト
            </button>
          </div>
          <multiselect
            id="operator-select"
            v-model="operator"
            :options="synthIds"
            :allow-empty="false"
            :custom-label="synthName"
            :placeholder="$t('settings.listPlaceholder')"
            :data-type="operator"
          >
            <template slot="option" slot-scope="o">
              {{ synthName(o.option) }}<span v-if="o.option == operatorDefault">（既定）</span>
            </template>
          </multiselect>
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
            :placeholder="$t('settings.listPlaceholder')"
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

.voice {
  .multiselect {
    height: 64px;
    margin-bottom: 8px;
  }

  & /deep/ .multiselect__tags {
    position: relative;
    height: 100%;
    overflow: hidden;
    box-shadow: inset 0 0 0 1px var(--color-border-light);
  }

  & /deep/ [data-type='webSpeech'] .multiselect__tags {
    background: url('../../media/images/windows_bg.png') center no-repeat;
    background-size: 100% auto;
  }

  & /deep/ [data-type='nVoice'] .multiselect__tags {
    background: url('../../media/images/nvoice_bg.png') center no-repeat;
    background-size: 100% auto;

    &::after {
      position: absolute;
      top: -64px;
      right: -37px;
      width: 414px;
      height: 415px;
      content: '';
      background: url('../../media/images/nvoice.png') center no-repeat;
      filter: drop-shadow(4px 4px 12px rgb(@black 0.3));
      background-size: 100% auto;
      opacity: 0.9;
    }
  }

  & /deep/ .multiselect__select {
    line-height: 64px;

    &::before {
      right: 16px;
      color: var(--color-text-light);
    }
  }

  & /deep/ .multiselect__input {
    height: 64px;
    padding: 0 16px;
    color: var(--color-text-light);
    text-shadow: 0 0 4px rgb(@black 0.25);
    background: transparent;
    border: none;

    &:hover {
      border-color: var(--color-border-light);
    }

    &:focus {
      background: var(--color-input-bg);
    }
  }

  & /deep/ .multiselect__content {
    top: 8px;
  }
}
</style>
