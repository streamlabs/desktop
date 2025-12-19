<template>
  <div class="media-box">
    <div class="url-uploader" v-if="showUrlUpload">
      {{ $t('Image URL') }}
      <text-input
        v-model="url"
        :metadata="{ placeholder: `${$t('Example')}: https://yoururl.com/image/Streamlabs` }"
      />
      <button class="button button--action" @click="uploadUrl">{{ $t('Submit') }}</button>
    </div>
    <img :src="value || metadata.clearImage" v-if="!/\.webm/.test(value) && !showUrlUpload" />
    <video
      v-if="(/\.webm$/.test(value) || /\.mp4$/.test(value)) && !showUrlUpload && value"
      loop
      muted
      autoplay
      :key="value"
      :src="value"
    />
    <div class="footer">
      <span class="filename">{{ fileName || 'Default' }}</span>
      <div>
        <i @click="toggleUrlUpload" class="icon-link" />
        <i @click="previewImage" class="fa fa-search-plus" />
        <i @click="clearImage" class="icon-close" />
        <span class="change-media" @click="updateValue">{{ $t('Change Media') }}</span>
      </div>
    </div>
  </div>
</template>

<script lang="ts" src="./MediaGalleryInput.vue.ts"></script>

<style lang="less" scoped>
@import '../../../styles/index';

.media-box {
  .radius();

  position: relative;
  width: 100%;
  max-width: 300px;
  height: 120px;
  background-color: var(--section);

  img,
  video {
    max-height: 110px;
    width: auto;
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }
}

.change-media {
  text-transform: uppercase;
  color: var(--paragraph);
  font-size: 11px;
}

.footer {
  display: flex;
  position: absolute;
  width: auto;
  bottom: 1px;
  left: 1px;
  right: 1px;
  height: 30px;
  justify-content: space-between;
  align-items: baseline;
  padding: 6px;
  background: var(--shadow);
  border-radius: 0 0 @radius @radius;

  i {
    margin-left: 10px;
    position: relative;
    top: 2px;
  }

  .icon-close {
    color: var(--warning);
  }
}

.filename {
  max-width: 50px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
}

i,
.change-media {
  transition: 0.1s all linear;

  &:hover {
    cursor: pointer;
    color: var(--white);
  }
}

.url-uploader {
  .radius();

  background-color: var(--background);
  padding: 12px;
  position: absolute;
  top: 1px;
  bottom: 1px;
  right: 1px;
  left: 1px;

  button {
    position: absolute;
    bottom: 25px;
    right: 12px;
  }
}
</style>
