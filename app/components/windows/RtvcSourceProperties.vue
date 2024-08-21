<template>
  <div class="modal-layout" id="mainWrapper">
    <div class="tab">
      <button type="button" class="button--tab" :class="{ active: tab == 0 }" @click="onTab(0)">
        {{ $t('source-props.nair-rtvc-source.nav.voice_setting') }}
      </button>
      <button type="button" class="button--tab" :class="{ active: tab == 1 }" @click="onTab(1)">
        {{ $t('source-props.nair-rtvc-source.nav.mic_setting') }}
      </button>
    </div>

    <div v-if="tab == 0" class="content">
      <div class="nav-menu">
        <div class="nav-menu-heading">
          {{ $t('source-props.nair-rtvc-source.nav.preset_voice') }}
        </div>
        <ul class="nav-menu-child">
          <li
            v-for="v in presetList"
            :key="v.value"
            class="nav-item"
            :class="{ active: v.value === currentIndex }"
          >
            <div class="nav-item-content" @click="onSelect(v.value)">
              <div class="icon-wrapper">
                <div class="icon" :data-label="v.label"></div>
                <div class="icon-badge" v-show="v.value === currentIndex">
                  <i class="icon-speech-engine"></i>
                </div>
              </div>
              <span class="name">{{ v.name }}</span>
            </div>
          </li>
        </ul>

        <div class="nav-menu-heading">
          {{ $t('source-props.nair-rtvc-source.nav.original_voice') }} ({{ manualList.length }}/{{
            manualMax
          }})
          <button
            v-if="canAdd"
            @click="onAdd()"
            class="indicator"
            v-tooltip.bottom="$t('source-props.nair-rtvc-source.nav.original_voice_add')"
          >
            <i class="icon-add icon-btn" />
          </button>
          <button v-else class="indicator" disabled>
            <i class="icon-add icon-btn disabled" />
          </button>
        </div>
        <ul class="nav-menu-child">
          <li
            v-for="v in manualList"
            :key="v.value"
            class="nav-item"
            :class="{ active: v.value === currentIndex }"
          >
            <div class="nav-item-content" @click="onSelect(v.value)">
              <div class="icon-wrapper">
                <div class="icon" :data-label="v.label"></div>
                <div class="icon-badge" v-show="v.value === currentIndex">
                  <i class="icon-speech-engine"></i>
                </div>
              </div>
              <span class="name">{{ v.name }}</span>
            </div>
            <popper
              ref="ppp"
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
                    <button v-if="canAdd" class="link" @click="onCopy(v.value)">
                      {{ $t('source-props.nair-rtvc-source.nav.copy_voice') }}
                    </button>
                    <button v-else class="link" disabled>
                      {{ $t('source-props.nair-rtvc-source.nav.copy_voice') }}
                    </button>
                  </li>
                </ul>
                <ul class="popup-menu-list">
                  <li class="popup-menu-item">
                    <button class="link text--red" @click="onDelete(v.value)">
                      {{ $t('source-props.nair-rtvc-source.nav.remove_voice') }}
                    </button>
                  </li>
                </ul>
              </div>
              <div class="indicator" :class="{ 'is-show': showPopupMenu }" slot="reference">
                <i class="icon-btn icon-ellipsis-vertical"></i>
              </div>
            </popper>
          </li>
        </ul>
      </div>

      <div class="content-container">
        <div class="content-inner" v-if="isPreset">
          <div class="character-header" :data-label="label">
            <div class="image"></div>
            <div class="text">
              <p class="name">{{ name }}</p>
              <p class="description">{{ description }}</p>
              <button class="button button--secondary" @click="playSample(label)">
                <i class="icon-speaker"></i
                >{{ $t('source-props.nair-rtvc-source.preset.play_sample') }}
              </button>
            </div>
          </div>
          <div class="section">
            <div class="section-heading-wrapper">
              <div class="section-heading">
                {{ $t('source-props.nair-rtvc-source.container.voice_setting') }}
              </div>
            </div>

            <div v-if="!isSongMode" class="input-container">
              <div class="input-label">
                <label
                  >{{ $t('source-props.nair-rtvc-source.pitch_shift.name') }}
                  <i
                    class="icon-help icon-tooltip"
                    v-tooltip.bottom="$t('source-props.nair-rtvc-source.preset.description')"
                  ></i>
                </label>
                <label> {{ pitchShift.toFixed(0) + ' cent' }} </label>
              </div>
              <div class="input-wrapper">
                <VueSlider
                  class="slider"
                  v-model="pitchShift"
                  :min="-1200"
                  :max="1200"
                  :interval="1"
                  tooltip="none"
                />
              </div>
            </div>

            <div v-if="isSongMode" class="input-container">
              <div class="input-label">
                <label
                  >{{ $t('source-props.nair-rtvc-source.pitch_shift.name') }}
                  <i
                    class="icon-help icon-tooltip"
                    v-tooltip.bottom="$t('source-props.nair-rtvc-source.preset.description')"
                  ></i>
                </label>
                <label> {{ labelForPitchSong(pitchShiftSong) }} </label>
              </div>
              <div class="input-wrapper">
                <VueSlider
                  class="slider"
                  v-model="pitchShiftSong"
                  :min="-1200"
                  :max="1200"
                  :interval="1200"
                  tooltip="none"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="section-wrapper" v-else>
          <div class="section">
            <div class="section-heading-wrapper">
              <div class="section-heading">
                {{ $t('source-props.nair-rtvc-source.container.voice_name') }}
              </div>
            </div>
            <div class="input-container">
              <div class="input-wrapper">
                <input type="text" v-model="name" />
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-heading-wrapper">
              <div class="section-heading">
                {{ $t('source-props.nair-rtvc-source.container.voice_setting') }}
              </div>
              <div class="button-wrapper">
                <button class="button--text" @click="onRandom">
                  {{ $t('source-props.nair-rtvc-source.container.make_random.name') }}
                </button>
                <i
                  class="icon-help icon-tooltip"
                  v-tooltip.bottom="
                    $t('source-props.nair-rtvc-source.container.make_random.description')
                  "
                ></i>
              </div>
            </div>

            <div class="input-container">
              <div v-if="!isSongMode" class="input-wrapper">
                <div class="input-label">
                  <label>{{ $t('source-props.nair-rtvc-source.pitch_shift.name') }}</label>
                  <label> {{ pitchShift.toFixed(0) + ' cent' }} </label>
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

              <div v-if="isSongMode" class="input-wrapper">
                <div class="input-label">
                  <label>{{ $t('source-props.nair-rtvc-source.pitch_shift.name') }}</label>
                  <label> {{ labelForPitchSong(pitchShiftSong) }} </label>
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

              <div class="input-wrapper">
                <div class="input-label">
                  <label>{{ $t('source-props.nair-rtvc-source.primary_voice.name') }}</label>
                </div>
                <multiselect
                  v-model="primaryVoiceModel"
                  :options="primaryVoiceList"
                  label="description"
                  trackBy="value"
                  :allow-empty="false"
                  :placeholder="$t('settings.listPlaceholder')"
                />
              </div>
              <div class="input-wrapper">
                <div class="input-label">
                  <label>{{ $t('source-props.nair-rtvc-source.secondary_voice.name') }}</label>
                </div>
                <multiselect
                  v-model="secondaryVoiceModel"
                  :options="secondaryVoiceList"
                  label="description"
                  trackBy="value"
                  :allow-empty="false"
                  :placeholder="$t('settings.listPlaceholder')"
                />
              </div>

              <div class="input-wrapper" v-if="secondaryVoice >= 0">
                <div class="input-label">
                  <label>{{ $t('source-props.nair-rtvc-source.amount.name') }} </label>
                  <label> {{ amount.toFixed(0) + '%' }}</label>
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
            </div>
          </div>
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

    <div class="modal-layout-controls">
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
}

.modal-layout-controls {
  .dividing-border(top);

  z-index: @z-index-default-content;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  height: 56px;
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

.content {
  display: flex;
  flex-grow: 1;
  overflow: hidden;
}

.content-menu {
  width: 200px;
  overflow-y: auto;
}

.content-container {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  padding: 16px 8px 0 16px;
  margin: 0;
  overflow-y: scroll;

  .nav-menu + & {
    padding-left: 0;
  }

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

.character-header {
  position: relative;
  height: 304px;
  overflow: hidden;
  border-radius: 4px 4px 0 0;

  &::before {
    position: absolute;
    top: 0;
    display: block;
    width: 100%;
    height: 48px;
    clip-path: polygon(0 0, 100% 0, 100% 8px, 0 48px);
    content: '';
    background-color: var(--color-white);
  }

  // 背景画像
  &::after {
    position: absolute;
    bottom: 52px;
    left: 0;
    width: 100%;
    height: 200px;
    content: '';
    background-image: url('../../../media/images/rtvc/bg.png');
    background-repeat: repeat-x;
    background-size: auto 100%;
  }

  .image {
    position: absolute;
    left: 50%;
    z-index: @z-index-expand-content;
    background-size: 100% auto;
    transform: translateX(-50%);
  }

  // 琴詠ニア
  &[data-label='near'] {
    background: radial-gradient(
      100% 100% at 50% 100%,
      var(--color-white) 0%,
      var(--color-brand-rtvc-near) 100%
    );

    .image {
      top: -6px;
      width: 768px;
      height: 768px;
      background-image: url('../../../media/images/rtvc/near.png');
      filter: drop-shadow(8px 6px 0 #ff9446);
    }
  }

  // ずんだもん
  &[data-label='zundamon'] {
    background: radial-gradient(
      100% 100% at 50% 100%,
      var(--color-white) 0%,
      var(--color-brand-rtvc-zundamon) 100%
    );

    .image {
      top: -64px;
      // bottom: -292px;
      width: 372px;
      height: 644px;
      background-image: url('../../../media/images/rtvc/zundamon.png');
      filter: drop-shadow(8px 6px 0 #54c003);
    }
  }

  //春日部つむぎ
  &[data-label='tsumugi'] {
    background: radial-gradient(
      100% 100% at 50% 100%,
      var(--color-white) 0%,
      var(--color-brand-rtvc-tsumugi) 100%
    );

    .image {
      top: -22px;
      // bottom: -408px;
      width: 725px;
      height: 728px;
      margin-left: -45px;
      background-image: url('../../../media/images/rtvc/tsumugi.png');
      filter: drop-shadow(8px 6px 0 #e1b52b);
    }
  }

  .text {
    position: absolute;
    bottom: 0;
    left: 50%;
    z-index: @z-index-expand-content;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 40px 0 24px;
    clip-path: polygon(0 40px, 100% 0, 100% 100%, 0 100%);
    background-color: var(--color-white);
    transform: translateX(-50%);

    .name {
      margin: 0;
      font-size: 18px;
      color: var(--color-black);
    }

    .description {
      margin: 0;
      font-size: 12px;
      color: var(--color-black);
    }

    .button {
      margin-top: 16px;
    }
  }
}

.section-wrapper {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
}

.section {
  &:last-of-type {
    flex-grow: 1;
  }

  .character-image + & {
    border-radius: 0 0 4px 4px;
  }
}

.nav-menu {
  width: 216px;
  padding: 8px 0;
}

.nav-menu-child {
  width: 100%;
  margin: 0 0 8px;
}

.nav-menu-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 32px;
  padding: 0 4px 0 16px;
  color: var(--color-text-light);
}

.nav-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 4px 4px 4px 0;
  font-size: @font-size4;
  color: var(--color-text);
  list-style: none;
  cursor: pointer;

  .indicator {
    display: none;
  }

  &:hover .indicator {
    display: flex;
  }
}

.nav-item-content {
  display: flex;
  flex-grow: 1;
  align-items: center;
  height: 100%;
  padding-left: 16px;
  overflow: hidden;

  .icon-wrapper {
    position: relative;
    flex-shrink: 0;

    .icon-badge {
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

      i {
        font-size: 8px;
        color: var(--color-bg-quinary);
      }
    }

    .active &::before {
      position: absolute;
      top: -4px;
      left: -4px;
      display: block;
      width: 32px;
      height: 32px;
      content: '';
      border: 2px solid var(--color-text-active);
      border-radius: 10000px;
    }
  }

  .icon {
    position: relative;
    width: 24px;
    height: 24px;
    overflow: hidden;
    border-radius: 10000px;

    // 画像部分
    &::before {
      position: absolute;
      bottom: 0;
      left: 3px;
      width: 18px;
      height: 21px;
      content: '';
      background-image: url('../../../media/images/rtvc/manual.png');
      background-size: 100% auto;
    }

    // 琴詠ニア
    &[data-label='near'] {
      background: radial-gradient(
        100% 100% at 50% 100%,
        var(--color-white) 0%,
        var(--color-brand-rtvc-near) 100%
      );

      &::before {
        bottom: -112px;
        left: -57px;
        width: 138px;
        height: 138px;
        background-image: url('../../../media/images/rtvc/near.png');
      }
    }

    // ずんだもん
    &[data-label='zundamon'] {
      background: radial-gradient(
        100% 100% at 50% 100%,
        var(--color-white) 0%,
        var(--color-brand-rtvc-zundamon) 100%
      );

      &::before {
        bottom: -78px;
        left: -22px;
        width: 69px;
        height: 118px;
        background-image: url('../../../media/images/rtvc/zundamon.png');
      }
    }

    //春日部つむぎ
    &[data-label='tsumugi'] {
      background: radial-gradient(
        100% 100% at 50% 100%,
        var(--color-white) 0%,
        var(--color-brand-rtvc-tsumugi) 100%
      );

      &::before {
        bottom: -99px;
        left: -59px;
        width: 128px;
        height: 128px;
        background-image: url('../../../media/images/rtvc/tsumugi.png');
      }
    }

    // オリジナルボイス（色は仮置き）
    &[data-label='manual0'] {
      background-color: #ff5c00;
    }

    &[data-label='manual1'] {
      background-color: #027333;
    }

    &[data-label='manual2'] {
      background-color: #ffc700;
    }

    &[data-label='manual3'] {
      background-color: #f00;
    }

    &[data-label='manual4'] {
      background-color: #0094ff;
    }
  }

  .name {
    display: inline-block;
    margin-left: 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .active & {
    color: var(--color-text-active);
  }

  .nav-item:not(.active) &:hover {
    color: var(--color-text-light);
  }
}

.popper {
  .popper-styling();

  width: 160px;
}

.indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;

  &.is-show {
    color: var(--color-text-light);
  }
}

.tab {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  height: 40px;
  padding: 0 16px;
  border-bottom: 1px solid var(--color-border-light);

  button {
    flex-basis: 0;
    flex-grow: 1;
    height: 100%;
  }
}

.button-wrapper {
  display: flex;
  align-items: center;

  .icon-btn {
    color: var(--color-button-primary);
  }
}

.slider {
  margin-top: 8px;
}

.toggle-wrapper {
  margin-right: auto;
}

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
