<template>
  <modal-layout :showControls="false" :customControls="true">
    <div slot="controls">
      <button class="button button--action" @click="showSettings">
        {{ $t('troubleshooter.openSettings') }}
      </button>
    </div>

    <div slot="content">
      <div v-if="issue.code == 'FRAMES_DROPPED'">
        <h4>
          <span class="icon-warning"></span>
          {{ issue.message }}
        </h4>
        <p>{{ $t('troubleshooter.droppedFramesAreDetected') }} {{ moment(issue.date) }}.<br /></p>
        <h4>{{ $t('troubleshooter.whatDoesThisMean') }}</h4>
        <p>
          {{ $t('troubleshooter.meaningOfDroppedFramesAreDetected') }}
        </p>
        <h4>
          {{ $t('troubleshooter.whatCanIDo') }}
        </h4>

        <ul>
          <li>{{ $t('troubleshooter.checkTheHealthOfYourInternetConnection') }}</li>
          <li>{{ $t('troubleshooter.changeYourIngestServer') }}</li>
          <li>{{ $t('troubleshooter.lowerYourBitrate') }}</li>
        </ul>
      </div>

      <div v-if="issue.code == 'FRAMES_SKIPPED'">
        <h4>
          <span class="icon-warning"></span>
          {{ issue.message }}
        </h4>
        <p>{{ $t('troubleshooter.skippedFramesAreDetected') }} {{ moment(issue.date) }}.<br /></p>
        <h4>
          {{ $t('troubleshooter.whatDoesThisMean') }}
        </h4>
        <p>
          {{ $t('troubleshooter.meaningOfDroppedFramesAreDetected1') }}
          {{ $t('troubleshooter.meaningOfDroppedFramesAreDetected2') }}
        </p>
        <h4>
          {{ $t('troubleshooter.whatCanIDo') }}
        </h4>

        <ul>
          <li>{{ $t('troubleshooter.lowerYourEncoderPreset') }}</li>
          <li>{{ $t('troubleshooter.closeOtherHeavyApplication') }}</li>
          <li>{{ $t('troubleshooter.enablePerformanceModeInTheEditorContextMenu') }}</li>
        </ul>
      </div>

      <div v-if="issue.code == 'FRAMES_LAGGED'">
        <h4>
          <span class="icon-warning"></span>
          {{ issue.message }}
        </h4>
        <p>{{ $t('troubleshooter.laggedFramesAreDetected') }} {{ moment(issue.date) }}.<br /></p>
        <h4>{{ $t('troubleshooter.whatDoesThisMean') }}</h4>
        <p>
          {{ $t('troubleshooter.meaningOflaggedFramesAreDetected1') }}
          {{ $t('troubleshooter.meaningOflaggedFramesAreDetected2') }}
          {{ $t('troubleshooter.meaningOflaggedFramesAreDetected3') }}
        </p>
        <h4>
          {{ $t('troubleshooter.whatCanIDo') }}
        </h4>

        <ul>
          <li>{{ $t('troubleshooter.capYourInGameFramerate') }}</li>
          <li>{{ $t('troubleshooter.enableVSyncInYourGame') }}</li>
          <li>{{ $t('troubleshooter.disableFreeSyncOrGSyncInYourDriver') }}</li>
          <li>{{ $t('troubleshooter.lowerGraphicsSettingsUntilYouStopLaggingFrames') }}</li>
          <li>{{ $t('troubleshooter.disableHardwareDecodingUnderAnyMediaSources') }}</li>
        </ul>
      </div>
    </div>
  </modal-layout>
</template>

<script lang="ts" src="./Troubleshooter.vue.ts"></script>

<style lang="less" scoped>
@import url('../../styles/index');

.icon-warning {
  margin-right: 4px;
  color: @red;
}

p,
ul {
  margin-bottom: 15px;
}
</style>
