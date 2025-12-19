<template>
  <div class="UpdaterWindow">
    <div>
      <i class="UpdaterWindow-icon fas fa-sync-alt fa-spin" />
      {{ message }}
    </div>

    <div v-if="percentComplete !== null && !installing && !error">
      <div class="UpdaterWindow-progressPercent">{{ percentComplete }}% complete</div>
      <div class="UpdaterWindow-progressBarContainer">
        <div class="UpdaterWindow-progressBar" :style="{ width: percentComplete + '%' }" />
      </div>
    </div>

    <div class="UpdaterWindow-issues" v-if="installing">
      This may take a few minutes. If you are having issues updating, please
      <span class="UpdaterWindow-link" @click="download"> download a fresh installer. </span>
    </div>
    <div class="UpdaterWindow-issues" v-if="error">
      There was an error updating. Please
      <span class="UpdaterWindow-link" @click="download"> download a fresh installer. </span>
    </div>
  </div>
</template>

<script>
const { ipcRenderer } = window.require('electron');
const remote = window.require('@electron/remote/main');
export default {
  data() {
    return {
      message: 'Checking for updates',
      installing: false,
      error: false,
      percentComplete: null,
    };
  },
  mounted() {
    ipcRenderer.on('autoUpdate-pushState', (event, data) => {
      if (data.version) {
        this.message = `Downloading version ${data.version}`;
      }
      if (data.percent) {
        this.percentComplete = Math.floor(data.percent);
      }
      if (data.installing) {
        this.installing = true;
        this.message = `Installing version ${data.version}`;
      }
      if (data.error) {
        this.error = true;
        this.message = 'Something went wrong';
      }
    });
    ipcRenderer.send('autoUpdate-getState');
  },
  methods: {
    download() {
      remote.shell.openExternal('https://streamlabs.com/streamlabs-obs');
      remote.app.quit();
    },
  },
};
</script>

<style lang="less" scoped>
.UpdaterWindow {
  height: 100%;
  padding: 32px;
  background-color: #17242d;
  color: #ffffff;
  font-size: 18px;
  text-align: center;
  -webkit-app-region: drag;
}
.updater-window__img {
  width: 48px;
}
.UpdaterWindow-icon {
  margin-right: 8px;
}
.UpdaterWindow-progressBarContainer {
  position: relative;
  margin-top: 40px;
  background-color: #09161d;
  border-radius: 4px;
  overflow: hidden;
}
.UpdaterWindow-progressBar {
  height: 8px;
  background-color: #31c3a2;
}
.UpdaterWindow-progressPercent {
  width: 100%;
  text-align: center;
  color: #bdc2c4;
  font-size: 14px;
  margin: 16px 0 24px 0;
}
.UpdaterWindow-issues {
  font-size: 13px;
  font-weight: 300;
  padding-top: 25px;
  -webkit-app-region: no-drag;
}
.UpdaterWindow-link {
  color: #bbb;
  cursor: pointer;
  &:hover {
    color: #eee;
  }
}
</style>
