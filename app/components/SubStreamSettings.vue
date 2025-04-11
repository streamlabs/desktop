<template>
  <div class="setting-section">
    <div class="section">
      <div class="input-container">
        <div class="input-label">
          <label>
            <div>
              ストリーム URL
              <button style="margin: 0" @click="showUrlTips = !showUrlTips">
                <i class="icon-help icon-tooltip" title="配信先のURLを指定します"></i>
              </button>
            </div>
          </label>
          <div v-if="showUrlTips" style="margin-left: 16px">
            <div>各サービスから提供されているストリーム URL を指定してください</div>
            <div>
              YouTube &nbsp;
              {{ defaultYoutubeUrl }}
              <button
                style="margin: 0"
                data-size="sm"
                data-radius="sm"
                data-color="secondary"
                data-variant="light"
                class="basic-button"
                @click="url = defaultYoutubeUrl"
              >
                セット
              </button>
            </div>
            <div>
              Twitch &nbsp;
              {{ defaultTwitchUrl }}
              <button
                style="margin: 0"
                data-size="sm"
                data-radius="sm"
                data-color="secondary"
                data-variant="light"
                class="basic-button"
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
          <div style="display: flex; gap: 8px">
            <input :type="showKey ? 'text' : 'password'" v-model="key" />
            <button
              style="width: 80px; height: 32px; margin: 0"
              data-size="sm"
              data-radius="sm"
              data-color="secondary"
              data-variant="light"
              class="basic-button"
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
      </div>

      <div class="input-container">
        <div style="display: flex; gap: 8px">
          <button
            style="margin: 0"
            data-size="md"
            data-radius="sm"
            data-color="secondary"
            data-variant="light"
            class="basic-button"
            @click="start()"
          >
            開始
          </button>
          <button
            style="margin: 0"
            data-size="md"
            data-radius="sm"
            data-color="secondary"
            data-variant="light"
            class="basic-button"
            @click="stop()"
          >
            停止
          </button>
        </div>
      </div>
    </div>

    <div class="section">
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
</style>
