<template>
  <div class="modal-layout" id="mainWrapper">
    <div class="modal-contents">
      <div class="content-nav">
        <i
          class="icon-speech-engine nav-icon"
          :class="{ 'nav-icon-active': tab == 0 }"
          @click="onTab(0)"
        ></i>
        <i
          class="icon-settings nav-icon"
          :class="{ 'nav-icon-active': tab == 1 }"
          @click="onTab(1)"
        ></i>
      </div>

      <div v-if="tab == 0" class="content-main">
        <div class="main-inner">
          <!-- presets -->
          <div class="main-header">
            {{ $t('source-props.nair-rtvc-source.nav.preset_voice') }}
          </div>
          <div class="main-list">
            <div
              v-for="v in presetList"
              :key="v.index"
              class="main-cell"
              :class="{ active: v.index === currentIndex }"
            >
              <div class="cell-content" @click="onSelect(v.index)">
                <div class="cellicon-wrapper">
                  <img class="cellicon" :src="v.image" />
                </div>
                <span class="cellicon-label">{{ v.name }}</span>
              </div>
            </div>
          </div>

          <!-- manuals -->
          <div class="main-header">
            {{ $t('source-props.nair-rtvc-source.nav.original_voice') }}
          </div>
          <div class="main-list">
            <div
              v-for="v in manualList"
              :key="v.index"
              class="main-cell"
              :class="{ active: v.index === currentIndex }"
            >
              <div class="cell-content" @click="onSelect(v.index)">
                <div class="cellicon-wrapper">
                  <img class="cellicon" :src="v.image" />
                </div>
                <span class="cellicon-label">{{ v.name }}</span>
              </div>

              <popper
                trigger="click"
                :options="{ placement: 'bottom-end' }"
                @show="
                  showPopupMenu = true;
                  popper = $event;
                "
                @hide="
                  showPopupMenu = false;
                  popper = undefined;
                "
              >
                <div class="popper">
                  <ul class="popup-menu-list">
                    <li class="popup-menu-item">
                      <button :disabled="!canAdd" class="link" @click="onCopy(v.index)">
                        {{ $t('source-props.nair-rtvc-source.nav.copy_voice') }}
                      </button>
                    </li>
                  </ul>
                  <ul class="popup-menu-list">
                    <li class="popup-menu-item">
                      <button
                        :disabled="!canDelete"
                        class="link"
                        :class="{ 'text--red': canDelete }"
                        @click="onDelete(v.index)"
                      >
                        {{ $t('source-props.nair-rtvc-source.nav.remove_voice') }}
                      </button>
                    </li>
                  </ul>
                </div>
                <div class="indicator" :class="{ 'is-show': showPopupMenu }" slot="reference">
                  <i class="icon-ellipsis-vertical"></i>
                </div>
              </popper>
            </div>

            <div class="main-cell" v-if="canAdd">
              <div class="cell-content" @click="onAdd()">
                <div class="cellicon-wrapper">
                  <img
                    class="cellicon"
                    src="../../../media/images/voice_images/voice_original_add.png"
                  />
                </div>
                <span class="cellicon-label">
                  {{ $t('source-props.nair-rtvc-source.nav.add_voice') }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="content-detail">
          <!-- detail top -->
          <div class="detail-top">
            <img class="image" :src="image" @click="playSample()" />
            <div class="frame-labels" v-if="isPreset">
              <p class="name">{{ name }}</p>
              <p class="description">{{ description }}</p>
            </div>
            <div class="frame-nameinput" v-else>
              <div class="input-wrapper">
                <input type="text" v-model="name" />
              </div>
            </div>
          </div>

          <!-- detail bottom -->
          <div class="detail-bottom">
            <div>
              <div class="labels">
                <span class="header">
                  {{ $t('source-props.nair-rtvc-source.nav.voice_setting') }}</span
                >
                <span v-if="!isPreset"
                  ><button class="button--text" @click="onRandom">
                    {{ $t('source-props.nair-rtvc-source.container.make_random.name') }}
                  </button>
                  <i
                    class="icon-help icon-tooltip"
                    v-tooltip.bottom="
                      $t('source-props.nair-rtvc-source.container.make_random.description')
                    "
                  ></i>
                </span>
              </div>
            </div>
            <!-- pitch -->
            <div v-if="isSongMode">
              <div class="labels">
                <span
                  >{{ $t('source-props.nair-rtvc-source.pitch_shift.name') }}
                  <i
                    class="icon-help icon-tooltip"
                    v-tooltip.bottom="$t('source-props.nair-rtvc-source.preset.description')"
                  ></i>
                </span>
                <span> {{ labelForPitchSong(pitchShiftSong) }} </span>
              </div>
              <VueSlider
                class="slider"
                v-model="pitchShiftSong"
                :min="-1200"
                :max="1200"
                :interval="1200"
                tooltip="none"
              />
            </div>
            <div v-else>
              <div class="labels">
                <span
                  >{{ $t('source-props.nair-rtvc-source.pitch_shift.name') }}
                  <i
                    class="icon-help icon-tooltip"
                    v-tooltip.bottom="$t('source-props.nair-rtvc-source.preset.description')"
                  ></i>
                </span>
                <span> {{ pitchShift.toFixed(0) + ' cent' }} </span>
              </div>
              <VueSlider
                class="slider"
                v-model="pitchShift"
                :min="-1200"
                :max="1200"
                :interval="1"
                tooltip="none"
              />
            </div>
            <!-- primary -->
            <div v-if="!isPreset">
              <div class="labels">
                <span>{{ $t('source-props.nair-rtvc-source.primary_voice.name') }}</span>
              </div>
              <multiselect
                v-model="primaryVoiceModel"
                :options="primaryVoiceList"
                label="description"
                trackBy="value"
                :allow-empty="false"
                :placeholder="$t('settings.listPlaceholder')"
                :searchable="false"
                class="short"
              />
            </div>
            <!-- secondary -->
            <div v-if="!isPreset">
              <div class="labels">
                <span>{{ $t('source-props.nair-rtvc-source.secondary_voice.name') }}</span>
              </div>
              <multiselect
                v-model="secondaryVoiceModel"
                :options="secondaryVoiceList"
                label="description"
                trackBy="value"
                :allow-empty="false"
                :placeholder="$t('settings.listPlaceholder')"
                :searchable="false"
                class="short"
              />
            </div>
            <!-- amount -->
            <div v-if="!isPreset && secondaryVoice >= 0">
              <div class="labels">
                <span>{{ $t('source-props.nair-rtvc-source.amount.name') }} </span>
                <span> {{ amount.toFixed(0) + '%' }}</span>
              </div>
              <VueSlider
                class="slider"
                v-model="amount"
                :min="0"
                :max="100"
                :interval="1"
                tooltip="none"
              />
            </div>
            <!-- -->
          </div>
        </div>
      </div>

      <div v-if="tab == 1" class="content">
        <div class="content-container">
          <div class="section">
            <div class="input-container">
              <div class="input-label">
                <label>{{ $t('source-props.nair-rtvc-source.device.name') }}</label>
              </div>
              <div class="input-wrapper">
                <multiselect
                  v-model="deviceModel"
                  :options="deviceList"
                  label="description"
                  trackBy="value"
                  :allow-empty="false"
                  :placeholder="$t('settings.listPlaceholder')"
                  :searchable="false"
                />
              </div>
            </div>

            <div class="input-container">
              <div class="input-label">
                <label
                  >{{ $t('source-props.nair-rtvc-source.latency.name') }}
                  <i
                    class="icon-help icon-tooltip wide"
                    v-tooltip.top="$t('source-props.nair-rtvc-source.latency.description')"
                  ></i
                ></label>
              </div>
              <div class="input-wrapper">
                <multiselect
                  v-model="latencyModel"
                  :options="latencyList"
                  label="description"
                  trackBy="value"
                  :allow-empty="false"
                  :placeholder="$t('settings.listPlaceholder')"
                  :searchable="false"
                />
              </div>
            </div>

            <div class="input-container">
              <div class="input-wrapper">
                <div class="row">
                  <div class="name">
                    {{ $t('source-props.nair-rtvc-source.song.name') }}
                    <i
                      class="icon-help icon-tooltip wide"
                      v-tooltip.top="$t('source-props.nair-rtvc-source.song.description')"
                    ></i>
                  </div>
                  <div class="value">
                    <input v-model="isSongMode" type="checkbox" class="toggle-button" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-controls">
      <div class="toggle-wrapper">
        <span class="toggle-label">{{ $t('source-props.nair-rtvc-source.nav.check_voice') }}</span>
        <input v-model="isMonitor" type="checkbox" class="toggle-button" />
      </div>

      <button class="button button--secondary" @click="cancel" data-test="Cancel">
        {{ $t('common.cancel') }}
      </button>
      <button class="button button--primary" @click="done" data-test="Done">
        {{ $t('common.done') }}
      </button>
    </div>
  </div>
</template>

<script lang="ts" src="./RtvcSourceProperties.vue.ts"></script>

<style lang="less" scoped>
@import url('../../styles/index');

.modal-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--color-bg-quinary);

  .modal-contents {
    display: flex;
    flex-direction: row;
    flex-grow: 1;
  }

  .modal-controls {
    .dividing-border(top);

    z-index: @z-index-default-content;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    text-align: right;
    background-color: var(--color-bg-primary);

    div {
      display: flex;
      justify-content: flex-end;
    }

    &:not(:empty) {
      padding: 8px 16px;
    }

    .button {
      .margin-left();
    }
  }
}

//---------------------------

.content-nav {
  .dividing-border(right);

  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 68px;
  background-color: var(--color-bg-quaternary);

  .nav-icon {
    padding: 16px;
    margin: 8px;
    border-radius: 4px;
  }

  .nav-icon-active {
    color: var(--color-primary);
    background-color: var(--color-bg-active);
  }
}

.content-main {
  display: flex;
  flex-direction: row;

  .main-inner {
    display: flex;
    flex-direction: column;
    width: 100%;
    margin: 8px;
  }
}

.content-detail {
  min-width: 248px;
  overflow: hidden;
  border-left: 1px solid var(--color-border-dark);
}

//---------------------------

.main-header {
  margin-top: 24px;
  font-weight: bold;
}

.main-list {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  gap: 24px;
  margin: 8px;
}

.main-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 96px;
  height: 130px;

  .popper {
    .popper-styling();

    width: 160px;
  }

  .indicator {
    position: absolute;
    top: 68px;
    right: 0;
    display: none;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    color: black;
    background: white;
    border-radius: 32px;
  }

  &:hover .indicator {
    display: flex;
  }
}

.cell-content {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100px;
  height: 125px;
  margin: 8px;

  .cellicon-wrapper {
    position: relative;
    flex-shrink: 0;

    .cellicon-badge {
      position: absolute;
      right: -6px;
      bottom: -6px;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      background-color: var(--color-text-active);
      border: 2px solid var(--color-bg-quinary);
      border-radius: 10000px;
    }

    .active &::before {
      position: absolute;
      top: -6px;
      left: -6px;
      display: block;
      width: 108px;
      height: 108px;
      content: '';
      border: 4px solid var(--color-text-active);
      border-radius: 10000px;
    }
  }

  .cellicon {
    width: 96px;
    height: 96px;
  }

  .cellicon-label {
    margin-top: 8px;
    font-weight: bold;
    text-align: center;
  }

  .active & {
    color: var(--color-text-active);
  }
}

//---------------------------

.detail-top {
  position: relative;
  height: 256px;
  background-image: url('../../../media/images/rtvc/voice_image_back.png');

  .image {
    position: absolute;
    top: 26px;
    left: 54px;
    width: 140px;
    height: 140px;
  }

  .frame-labels {
    position: absolute;
    top: 192px;
    width: 100%;
    text-align: center;
  }

  .frame-nameinput {
    position: absolute;
    top: 192px;
    display: flex;
    flex-direction: row;
    justify-content: center;
    width: 100%;
    text-align: center;
  }

  .name {
    margin: 0;
    font-size: 16px;
    font-weight: bold;
    color: var(--color-text);
    text-align: center;
  }

  .description {
    margin: 0;
    font-size: 12px;
    color: var(--color-text);
    text-align: center;
  }
}

.detail-bottom {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  color: var(--color-text);

  .header {
    font-weight: bold;
  }

  .labels {
    display: flex;
    justify-content: space-between;
    color: var(--color-text);
  }
}

.short {
  /deep/ .multiselect__content {
    max-height: 104px;
  }
}

//---------------------------

.content {
  display: flex;
  flex-grow: 1;
  overflow: hidden;
}

.content-container {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  padding: 16px 8px 0 16px;
  margin: 0;
  overflow-y: scroll;

  .content-inner {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
  }

  .input-container {
    flex-direction: column;

    .input-label,
    .input-wrapper {
      width: 100%;
    }

    .input-label {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;

      label {
        color: var(--color-text);
      }
    }
  }
}

.section {
  &:last-of-type {
    flex-grow: 1;
  }
}

.toggle-wrapper {
  margin-right: auto;
}
</style>
