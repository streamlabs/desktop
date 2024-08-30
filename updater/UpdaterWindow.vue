<template>
  <div class="UpdaterWindow">
    <div class="message-wrap">
      <i18n :path="`${currentState}.message`" class="message" v-bind:class="{ error: isError }">
        <span place="version">{{ version }}</span>
      </i18n>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 128 128"
        class="icon-spin"
        v-if="showSpin"
      >
        <path
          d="M59.077.648V11.725a53.139,53.139,0,0,0-33.231,90l13.385-12a35.278,35.278,0,0,1,19.846-60V40.033L90.615,20.34Zm43.077,26.923-13.231,12a35.277,35.277,0,0,1-20,59.846V89.263L37.385,108.956l31.538,19.692V117.571a53.139,53.139,0,0,0,33.231-90Z"
        />
      </svg>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 128 128"
        class="icon-warning"
        v-if="isError"
      >
        <path
          d="M126.508,104.516,69.747,18.25a6.576,6.576,0,0,0-9.88-1.7,7.57,7.57,0,0,0-1.512,1.7L1.392,104.742a8.817,8.817,0,0,0,1.466,11.39A6.74,6.74,0,0,0,7.1,117.749l113.724-.236c3.994-.063,7.186-3.753,7.129-8.241A8.8,8.8,0,0,0,126.508,104.516ZM60.824,36.144h6.254A4.825,4.825,0,0,1,71.9,40.968V80.387a4.825,4.825,0,0,1-4.825,4.825H60.824A4.825,4.825,0,0,1,56,80.387V40.968A4.825,4.825,0,0,1,60.824,36.144ZM71.9,103.791a4.825,4.825,0,0,1-4.825,4.825H60.824A4.825,4.825,0,0,1,56,103.791V96.78a4.825,4.825,0,0,1,4.825-4.825h6.254A4.825,4.825,0,0,1,71.9,96.78Z"
        />
      </svg>
    </div>
    <div v-if="isAsking" class="asking content-wrap">
      <div class="content">
        <p class="label">
          <span class="supplement mandatory" v-if="isUnskippable">{{
            $t('asking.mandatoryUpdate')
          }}</span>
          <span class="supplement" v-if="!isUnskippable">{{ $t('asking.skippableUpdate') }}</span>
        </p>
        <div class="change-wrap">
          <p class="caption">{{ $t('asking.changeLog') }}</p>
          <div class="patch-notes-wrap">
            <div class="patch-notes">
              <p v-for="(line, index) in releaseNotes" v-bind:key="index" v-text="line" />
            </div>
          </div>
        </div>
      </div>
      <div class="controls">
        <button
          v-if="!isUnskippable"
          class="button button--secondary"
          @click="cancel"
          data-test="Cancel"
        >
          {{ $t('asking.skip') }}
        </button>
        <button class="button button--primary" @click="proceedDownload" data-test="Download">
          {{ $t('asking.download') }}
        </button>
      </div>
    </div>
    <div v-if="isDownloading && percentComplete !== null" class="downloading content-wrap">
      <div class="content">
        <div class="progressBarContainer">
          <div class="progressBar" :style="{ width: percentComplete + '%' }" />
          <div class="progressPercent">{{ percentComplete }}%</div>
        </div>
      </div>
      <div class="controls">
        <button
          v-if="!isUnskippable"
          class="button button--secondary"
          @click="cancel"
          data-test="Cancel"
        >
          {{ $t('cancel') }}
        </button>
      </div>
      <div class="issues" v-if="isInstalling || isError">
        <i18n :path="`${currentState}.description`">
          <a class="link" @click="download" place="linkText">
            {{ $t(`${currentState}.linkText`) }}
          </a>
        </i18n>
      </div>
    </div>
  </div>
</template>

<script>
const { ipcRenderer } = window.require('electron');
export default {
  data() {
    return {
      currentState: 'checking',
      version: null,
      percentComplete: null,
      releaseNotes: null,
      releaseDate: null,
      isUnskippable: null,
    };
  },
  computed: {
    showSpin() {
      return (
        this.currentState === 'checking' ||
        this.currentState === 'downloading' ||
        this.currentState === 'installing'
      );
    },
    isChecking() {
      return this.currentState === 'checking';
    },
    isAsking() {
      return this.currentState === 'asking';
    },
    isDownloading() {
      return this.currentState === 'downloading';
    },
    isInstalling() {
      return this.currentState === 'installing';
    },
    isError() {
      return this.currentState === 'error';
    },
  },
  mounted() {
    this.isUnskippable = null;

    ipcRenderer.on('autoUpdate-pushState', (event, data) => {
      this.currentState = 'checking';
      this.version = null;
      this.percentComplete = null;
      if (data.isUnskippable) {
        this.isUnskippable = data.isUnskippable;
      }
      if (data.version) {
        this.currentState = 'downloading';
        this.version = data.version;
        this.releaseNotes = data.releaseNotes;
        this.releaseDate = data.releaseDate;
      }
      if (data.percent) {
        this.percentComplete = Math.floor(data.percent);
      }
      if (data.asking) {
        this.currentState = 'asking';
      }
      if (data.installing) {
        this.currentState = 'installing';
      }
      if (data.error) {
        this.currentState = 'error';
      }
    });
    ipcRenderer.send('autoUpdate-getState');
  },
  methods: {
    proceedDownload() {
      ipcRenderer.send('autoUpdate-startDownload');
    },
    cancel() {
      this.currentState = '';
      ipcRenderer.send('autoUpdate-cancelDownload');
    },
    download() {
      remote.shell.openExternal('https://n-air-app.nicovideo.jp/');
      remote.app.quit();
    },
  },
};
</script>

<style lang="less" scoped>
@import url('../app/styles/index');

.UpdaterWindow {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
  margin: 0;
  font-size: @font-size5;
  color: var(--color-text-light);
  text-align: center;
  background-color: var(--color-bg-primary);
  -webkit-app-region: no-drag;
}

.message-wrap {
  padding: 24px 0 0;
}

.message {
  font-size: @font-size5;
  line-height: 1.6;
  color: var(--color-text-light);
  vertical-align: middle;
}

.error {
  color: var(--color-error);
}

.content-wrap {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  padding: 0;
}

.label {
  display: flex;
  justify-content: center;

  .supplement {
    padding: 2px 8px;
    font-size: @font-size2;
    line-height: 1.6;
    color: var(--color-text-light);
    border: solid 1px var(--color-text-light);
  }

  .mandatory {
    color: var(--color-accent);
    border: solid 1px var(--color-accent);
  }
}

.caption {
  padding: 0;
  margin: 0 0 8px;
  font-size: @font-size4;
  line-height: 1.6;
  color: var(--color-text-light);
  text-align: left;
}

.patch-notes {
  box-sizing: border-box;
  padding: 0;
  margin: 0;
  font-size: @font-size4;
  line-height: 1.6;
  text-align: left;
}

.patch-notes p {
  color: var(--color-text);
  -webkit-margin-before: 0;
  -webkit-margin-after: 0;
}

.patch-notes a {
  color: var(--color-text-light);
  text-decoration: none;
  pointer-events: none;
}

.progressBarContainer {
  position: relative;
  width: 546px;
  margin-bottom: 16px;
  overflow: hidden;
  text-align: center;
  background-color: var(--color-bg-tertiary);
  border-radius: 2px;
}

.progressBar {
  height: 24px;
  background-color: var(--color-accent);
}

.progressPercent {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  font-size: 15px;
  line-height: 24px;
  color: var(--color-text-light);
  text-align: center;
}

.issues {
  padding-top: 24px;
  font-size: @font-size2;
  font-weight: 300;
  text-align: center;
  -webkit-app-region: no-drag;
}

.link {
  color: var(--color-text-active);
  text-decoration: underline;
  cursor: pointer;
}

.link:hover {
  color: var(--color-text-light);
  text-decoration: none;
}

.icon-spin {
  width: 22px;
  vertical-align: middle;
  fill: var(--color-text-light);
  animation: icon-spin 2s infinite linear;
}

.icon-warning {
  width: 22px;
  vertical-align: middle;
  fill: var(--color-accent);
}
@keyframes icon-spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(359deg);
  }
}

button {
  border: none;
}

.change-wrap {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  padding: 16px;
  margin-top: 16px;
  overflow-y: auto;
  background-color: var(--color-bg-secondary);
  border-radius: 4px;
}

.content {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  padding: 8px 16px 16px;
  overflow: hidden;

  .asking {
    gap: 8px;
  }

  .downloading & {
    align-items: center;
    justify-content: center;
  }
}

.controls {
  .dividing-border(top);

  z-index: @z-index-default-content;
  display: flex;
  flex-shrink: 0;
  justify-content: flex-end;
  text-align: right;
  background-color: var(--color-bg-primary);

  &:not(:empty) {
    padding: 8px 16px;
  }

  .button {
    .margin-left();
  }
}
</style>
