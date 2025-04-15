<template>
  <div class="setting-section">
    <div class="section">
      <div class="input-container">
        <div class="input-label">
          <label>
            <div>
              ストリーム URL
              <button class="help-button" @click="showUrlTips = !showUrlTips">
                <i class="icon-help icon-tooltip" title="配信先のURLを指定します"></i>
              </button>
            </div>
          </label>
          <div v-if="showUrlTips" class="url-tips">
            <div>各サービスから提供されているストリーム URL を指定してください</div>
            <div>
              YouTube &nbsp;
              {{ defaultYoutubeUrl }}
              <button
                class="set-url-button basic-button"
                data-size="sm"
                data-radius="sm"
                data-color="secondary"
                data-variant="light"
                @click="url = defaultYoutubeUrl"
              >
                セット
              </button>
            </div>
            <div>
              Twitch &nbsp;
              {{ defaultTwitchUrl }}
              <button
                class="set-url-button basic-button"
                data-size="sm"
                data-radius="sm"
                data-color="secondary"
                data-variant="light"
                @click="url = defaultTwitchUrl"
              >
                セット
              </button>
            </div>
          </div>
        </div>
        <div class="input-wrapper">
          <input type="text" v-model="url" />
        </div>
      </div>

      <div class="input-container">
        <div class="input-label">
          <label>
            ストリームキー
            <i class="icon-help icon-tooltip" title="配信先のストリームキーを指定します"></i>
          </label>
        </div>
        <div class="input-wrapper">
          <div class="key-input-wrapper">
            <input :type="showKey ? 'text' : 'password'" v-model="key" />
            <button
              class="toggle-key-button basic-button"
              style="margin: 0"
              data-size="sm"
              data-radius="sm"
              data-color="secondary"
              data-variant="light"
              @click="showKey = !showKey"
            >
              {{ showKey ? '非表示' : '表示' }}
            </button>
          </div>
        </div>
      </div>

      <div class="input-container">
        <div class="input-label">
          <label>
            映像コーディック<i
              class="icon-help icon-tooltip"
              title="デフォルトは obs_x264 です"
            ></i>
          </label>
        </div>
        <div class="input-wrapper">
          <multiselect
            v-model="videoCodec"
            :options="videoCodecs"
            label="name"
            trackBy="id"
            :allow-empty="false"
            :searchable="false"
          >
          </multiselect>
        </div>
      </div>

      <div class="input-container">
        <div class="input-label">
          <label>
            映像ビットレート (Kbps)<i
              class="icon-help icon-tooltip"
              title="デフォルトは 2500 Kbps です"
            ></i>
          </label>
        </div>
        <div class="input-wrapper">
          <input type="number" v-model="videoBitrate" min="200" max="100000" />
        </div>
      </div>

      <div class="input-container">
        <div class="input-label">
          <label>
            音声コーディック<i
              class="icon-help icon-tooltip"
              title="デフォルトは ffmpeg_aac です"
            ></i>
          </label>
        </div>
        <div class="input-wrapper">
          <multiselect
            v-model="audioCodec"
            :options="audioCodecs"
            label="name"
            trackBy="id"
            :allow-empty="false"
            :searchable="false"
          >
          </multiselect>
        </div>
      </div>

      <div class="input-container">
        <div class="input-label">
          <label>
            音声ビットレート (Kbps)<i
              class="icon-help icon-tooltip"
              title="デフォルトは 128 Kbps です"
            ></i
          ></label>
          <div class="input-wrapper">
            <input type="number" v-model="audioBitrate" min="64" max="320" />
          </div>
        </div>
      </div>

      <div class="input-container">
        <div class="input-wrapper">
          <div class="row">
            <div class="name">配信開始/終了にあわせる</div>
            <div class="value">
              <input type="checkbox" v-model="sync" class="toggle-button" />
            </div>
          </div>
        </div>

        <div class="input-container">
          <div class="action-buttons">
            <button
              class="control-button basic-button"
              data-size="md"
              data-radius="sm"
              data-color="secondary"
              data-variant="light"
              @click="start()"
            >
              開始
            </button>
            <button
              class="control-button basic-button"
              data-size="md"
              data-radius="sm"
              data-color="secondary"
              data-variant="light"
              @click="stop()"
            >
              停止
            </button>
          </div>
        </div>
      </div>

      <div style="white-space: pre-wrap">{{ status }}</div>
    </div>
  </div>
</template>

<script lang="ts" src="./SubStreamSettings.vue.ts"></script>

<style lang="less" scoped>
@import url('../styles/index');

.row {
  display: flex;
  flex-direction: row;
  align-items: center;
  width: 100%;
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

.help-button {
  padding: 0;
  margin: 0 !important;
  vertical-align: middle;
  cursor: pointer;
  background: none;
  border: none;
}

.url-tips {
  margin-bottom: 8px;
  margin-left: 16px;
  font-size: @font-size3;
  color: var(--color-text-sub);
}

.set-url-button {
  height: 18px;
  margin: 0 !important;
}

.key-input-wrapper {
  display: flex;
  gap: 8px;
  align-items: center;
}

.toggle-key-button {
  width: 80px;
  height: 32px;
  margin: 0;
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.control-button {
  margin: 0;
}
</style>
