<template>
  <div class="media-box">
    <div class="url-uploader" v-if="showUrlUpload">
      {{ $t('Image URL') }}
      <text-input v-model="url" :metadata="{ placeholder: `${$t('Example')}: https://yoururl.com/image/Streamlabs` }" />
      <button class="button button--action" @click="uploadUrl">{{ $t('Submit') }}</button>
    </div>
    <div class="footer">
      <span class="filename">{{ fileName || $t('No Sound') }}</span>
      <div>
        <i @click="toggleUrlUpload" class="icon-link" />
        <i @click="previewSound" class="fa fa-search-plus" />
        <i @click="clearSound" class="icon-close" />
        <span @click="updateValue" class="change-media">{{ $t('Change Media') }}</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts" src="./SoundInput.vue.ts"></script>

<style lang="less" scoped>
@import "../../../styles/index";

.media-box {
  .radius();

  position: relative;
  width: 100%;
  max-width: 300px;
  height: 30px;
  background-color: var(--section);
}

.footer {
  display: flex;
  position: absolute;
  width: auto;
  bottom: 1px;
  left: 1px;
  right: 1px;
  height: 30px;
  padding: 6px;
  justify-content: space-between;
  align-items: baseline;

  i {
    margin-left: 10px;
    position: relative;
    top: 2px;
  }

  .icon-close {
    color: var(--warning);
  }
}

.change-media,
i {
  transition: 0.1s all linear;

  &:hover {
    cursor: pointer;
    color: var(--white);
  }
}

.filename {
  max-width: 50px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
}

.url-uploader {
  .radius();

  background-color: var(--background);
  padding: 12px;
  position: absolute;
  height: 120px;
  width: 100%;
  border: 1px solid var(--border);
  z-index: @z-overlay;

  button {
    position: absolute;
    bottom: 25px;
    right: 12px;
  }
}

.change-media {
  text-transform: uppercase;
  font-size: 11px;
  color: var(--paragraph);
}
</style>
