<template>
  <modal-layout :show-controls="false" no-scroll>
    <div slot="content" class="table-wrapper section">
      <table>
        <thead>
          <tr>
            <th class="device">{{ $t('common.name') }}</th>
            <th class="volume">{{ $t('audio.volumeInPercent') }}</th>
            <th class="downmix">{{ $t('audio.downmixToMono') }}</th>
            <th class="syncOffset">{{ $t('audio.syncOffsetInMs') }}</th>
            <th class="audioMonitor">{{ $t('audio.audioMonitoring') }}</th>
            <th class="track">{{ $t('audio.tracks') }}</th>
          </tr>
        </thead>
        <tr v-for="audioSource in audioSources" :key="audioSource.sourceId">
          <td>{{ audioSource.name }}</td>
          <td
            v-for="formInput in audioSource.getSettingsForm()"
            :key="`${audioSource.name}${formInput.name}`"
            :class="'column-' + formInput.name"
          >
            <component
              v-if="propertyComponentForType(formInput.type)"
              :is="propertyComponentForType(formInput.type)"
              :value="formInput"
              @input="value => onInputHandler(audioSource, formInput.name, value.value)"
            />
          </td>
        </tr>
      </table>
    </div>
  </modal-layout>
</template>

<script lang="ts" src="./AdvancedAudio.vue.ts"></script>

<style lang="less" scoped>
@import url('../../styles/index');

.table-wrapper {
  .radius;

  flex-grow: 1;
  padding: 0;
  margin: 0;
  overflow: auto;
}

table {
  min-width: 1170px;
  margin: 0;

  // reset
  tr {
    background-color: transparent;
    border-color: transparent;
    border-radius: 0;

    td {
      padding: 16px;
      border: none;

      &:last-child {
        padding-right: 16px;
      }
    }
  }
}

.volume {
}

.device {
  width: 150px;
}

.downmix {
  width: 120px;
}

.syncOffset {
}

.audioMonitor {
}

.track {
}

.device,
.volume,
.downmix,
.syncOffset,
.audioMonitor,
.track {
  color: var(--color-text-dark);
  text-align: center;
}

th,
td {
  text-align: left;
}

.column-deflection {
  width: 104px;
}

.column-syncOffset {
  width: 120px;
}

.column-monitoringType {
  width: 350px;
}

// TODO: 暫定対応
& /deep/ .input-wrapper {
  display: flex;
  margin-bottom: 0;
}
</style>
