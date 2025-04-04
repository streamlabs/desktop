<template>
  <div class="setting-section">
    <div class="section">
      <div class="input-label section-heading">
        <label>設定</label>
      </div>
      <div class="input-container">
        <div class="input-wrapper">stream url <input type="text" v-model="url" /></div>
        <div class="input-wrapper">stream key <input type="text" v-model="key" /></div>

        <div class="input-wrapper">
          video codec
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
        <div class="input-wrapper">
          video bitrate (kbps)<input type="number" v-model="videoBitrate" min="200" max="100000" />
        </div>

        <div class="input-wrapper">
          audio codec
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
        <div class="input-wrapper">
          audio bitrate (kbps)<input type="number" v-model="audioBitrate" min="64" max="320" />
        </div>

        <div class="input-wrapper">
          <div class="row">
            <div class="name">配信開始終了にあわせる</div>
            <div class="value">
              <input type="checkbox" v-model="sync" class="toggle-button" />
            </div>
          </div>
        </div>

        <div class="input-wrapper">
          <button
            data-size="md"
            data-radius="sm"
            data-color="secondary"
            data-variant="light"
            class="basic-button"
            @click="start()"
          >
            Start
          </button>
          <button
            data-size="md"
            data-radius="sm"
            data-color="secondary"
            data-variant="light"
            class="basic-button"
            @click="stop()"
          >
            Stop
          </button>
          <div>
            {{ status }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" src="./SubStreamSettings.vue.ts"></script>
<style lang="less" scoped>
@import url('../styles/index');
</style>
