<template>
  <modal-layout :showControls="false" :customControls="true">
    <div slot="controls">
      <start-streaming-button v-if="issue.code === 'FRAMES_DROPPED'"></start-streaming-button>
      <button class="button button--action" @click="showSettings">
        {{ $t('Open Settings') }}
      </button>
    </div>

    <div slot="content">
      <div v-if="issue.code === 'FRAMES_DROPPED'">
        <h4>
          <span class="fa fa-warning"></span>
          {{ issue.message }}
        </h4>
        <p>{{ $t(' Streamlabs has detected dropped frames') }} {{ moment(issue.date) }}.<br /></p>
        <h4>{{ $t('What does this mean?') }}</h4>
        <p>
          {{
            $t(
              ' Some frames have not been uploaded. This problem is usually related to a poor network connection.',
            )
          }}
        </p>
        <h4>
          {{ $t('What can I do?') }}
        </h4>

        <ul>
          <li>{{ $t('Check the health of your Internet connection') }}</li>
          <li>{{ $t('Change your ingest server') }}</li>
          <li>{{ $t('If none of these worked, lower your bitrate') }}</li>
        </ul>

        <div class="inline-controls">
          <h4 v-if="isStreaming">
            {{ $t('Stop streaming to access these controls:') }}
          </h4>
          <GenericFormGroups v-model="streamingSettings" @input="saveStreamingSettings" />
          <GenericFormGroups v-model="outputSettings" @input="saveOutputSettings" />
        </div>
      </div>

      <div v-if="issue.code === 'FRAMES_SKIPPED'">
        <h4>
          <span class="fa fa-warning"></span>
          {{ issue.message }}
        </h4>
        <p>{{ $t('Streamlabs has detected skipped frames') }} {{ moment(issue.date) }}.<br /></p>
        <h4>
          {{ $t('What does this mean?') }}
        </h4>
        <p>
          {{ $t('Some frames have not been encoded.') }}
          {{ $t('This problem is usually due to high CPU usage or unsuitable encoder settings.') }}
        </p>
        <h4>
          {{ $t('What can I do?') }}
        </h4>

        <ul>
          <li>{{ $t('Lower your encoder settings (preset)') }}</li>
          <li>
            {{
              $t(
                "Ensure that you don't have any other applications open that are heavy on your CPU",
              )
            }}
          </li>
          <li>{{ $t('Enable performance mode in the Editor context menu') }}</li>
        </ul>
      </div>

      <div v-if="issue.code === 'FRAMES_LAGGED'">
        <h4>
          <span class="fa fa-warning"></span>
          {{ issue.message }}
        </h4>
        <p>{{ $t('Streamlabs has detected lagged frames') }} {{ moment(issue.date) }}.<br /></p>
        <h4>{{ $t('What does this mean?') }}</h4>
        <p>
          {{ $t('Some frames took too long to get rendered.') }}
          {{ $t('Usually the problem is related to your game using up too many GPU resources.') }}
          {{
            $t(
              'When this happens, Streamlabs does not have any resources left over to render frames.',
            )
          }}
        </p>
        <h4>
          {{ $t('What can I do?') }}
        </h4>

        <ul>
          <li>{{ $t('Cap your in-game framerate') }}</li>
          <li>{{ $t('Enable VSync in your game') }}</li>
          <li>{{ $t('Disable FreeSync or GSync in your Driver') }}</li>
          <li>{{ $t('Lower graphics settings until you stop lagging frames') }}</li>
          <li>
            {{
              $t(
                'Disable hardware decoding under any media sources(This will slightly increase cpu over gpu)',
              )
            }}
          </li>
        </ul>
      </div>

      <div v-if="issue.code === 'HIGH_CPU_USAGE'">
        <h4>
          <span class="fa fa-warning"></span>
          {{ issue.message.split(':')[0] }}
        </h4>
        <p>
          {{ $t('Streamlabs has detected high CPU usage in Dual Output mode') }}
          {{ moment(issue.date) }}.<br />
        </p>
        <h4>{{ $t('What does this mean?') }}</h4>
        <p>
          {{ $t('System resource overuse.') }}
          {{
            $t(
              'To mitigate hide one of outputs or right click in editor to enable Performance Mode.',
            )
          }}
          {{
            $t(
              'This problem could also be due to high CPU usage from other applications or unsuitable encoder settings.',
            )
          }}
          {{ $t('When this happens, Streamlabs does not have any resources left over.') }}
        </p>
        <h4>
          {{ $t('What can I do?') }}
        </h4>

        <ul>
          <li>{{ $t('Enable performance mode in the Editor context menu') }}</li>
          <li>{{ $t("Hide one or both of the displays in Editor's Scene section") }}</li>
          <li>
            {{
              $t(
                "Ensure that you don't have any other applications open that are heavy on your CPU",
              )
            }}
          </li>
        </ul>

        <button class="button button--action" @click="enablePerformanceMode">
          {{ $t('Enable Performance Mode') }}
        </button>
      </div>
    </div>
  </modal-layout>
</template>

<script lang="ts" src="./Troubleshooter.vue.ts"></script>

<style lang="less" scoped>
@import '../../styles/index';

.fa-warning {
  color: var(--warning);
}

p,
ul {
  margin-bottom: 15px;
}

.inline-controls /deep/ .section-title {
  display: none;
}

.inline-controls /deep/ .section-content--opened {
  margin-top: 0;
}

.inline-controls /deep/ .input-container {
  display: block;

  .input-label {
    margin-bottom: 8px;
  }

  .input-wrapper,
  .int-input {
    width: 100%;
  }
}
</style>
