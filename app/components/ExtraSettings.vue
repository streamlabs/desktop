<template>
  <div>
    <div class="section" v-if="isNiconicoLoggedIn()">
      <div class="input-label">
        <label>{{ $t('settings.optimizationForNiconicoLiveService') }}</label>
      </div>
      <ObsBoolInput :value="optimizeForNiconicoModel" @input="setOptimizeForNiconico" />
      <ObsBoolInput
        :value="showOptimizationDialogForNiconicoModel"
        v-show="optimizeForNiconicoModel.value"
        @input="setShowOptimizationDialogForNiconico"
        class="optional-item"
      />
      <ObsBoolInput
        :value="optimizeWithHardwareEncoderModel"
        v-show="optimizeForNiconicoModel.value"
        @input="setOptimizeWithHardwareEncoder"
        class="optional-item"
      />
    </div>

    <div class="section">
      <div class="input-label">
        <label>{{ $t('settings.compactMode') }}</label>
      </div>
      <ObsBoolInput :value="autoCompactModel" @input="setAutoCompact" />
      <ObsBoolInput :value="showAutoCompactDialogModel" @input="setShowAutoCompactDialog" />
      <ObsBoolInput :value="compactAlwaysOnTopModel" @input="setCompactAlwaysOnTop" />
    </div>

    <div class="section">
      <div class="input-label">
        <label>{{ $t('settings.cacheManagement') }}</label>
      </div>
      <p>{{ $t('settings.cacheClearDescription') }}</p>

      <div class="flex">
        <a class="button button--secondary" @click="showCacheDir">
          {{ $t('settings.showCacheDirectory') }}
        </a>
        <a class="button button--secondary" @click="deleteCacheDir">
          {{ $t('settings.deleteCacheAndRestart') }}
        </a>
      </div>

      <div class="input-label">
        <label for="cacheId">{{ $t('settings.cacheId') }}</label>
      </div>
      <p>{{ $t('settings.cacheIdDescription') }}</p>

      <div class="cacheid-view">
        <label>
          <input type="checkbox" v-model="showCacheId" />
          <div class="view-button"><i class="icon-unhide off" /><i class="icon-hide on" /></div>
          <input :type="showCacheId ? 'text' : 'password'" id="cacheId" :value="cacheId" readonly />
        </label>
        <button class="cacheid-copy button button--secondary" @click="copyToClipboard(cacheId)">
          {{ $t('settings.cacheIdCopy') }}
        </button>
      </div>
    </div>

    <div class="section">
      <ObsBoolInput
        :value="pollingPerformanceStatisticsModel"
        @input="setPollingPerformanceStatistics"
      />
      <p>{{ $t('settings.pollingPerformanceStatisticsDescription') }}</p>
    </div>
  </div>
</template>

<script lang="ts" src="./ExtraSettings.vue.ts"></script>

<style lang="less">
@import url('../styles/index');

.optional-item {
  margin-left: 24px;
}

.cacheid-view {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  font-size: @font-size4;

  label {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    height: @item-generic-size;
    padding: 0;
    margin: 0;
    margin-bottom: 16px;
    color: var(--color-text-active);
    cursor: pointer;
    border: 1px solid var(--color-input);
    border-radius: 4px;

    input[type='password'] {
      width: 332px;
      font-family: Verdana, sans-serif;
      font-size: 0;
      color: var(--color-text-light);
    }

    input[type='checkbox'] {
      display: none;

      & ~ .view-button {
        .transition;

        position: relative;
        display: inline-block;
        width: 36px;
        padding: 0 8px;
        font-size: @font-size5;
        text-align: center;
        cursor: pointer;

        &:hover {
          color: @white;
        }

        .on {
          display: inline-block;
        }

        .off {
          display: none;
        }
      }

      &:checked ~ .view-button {
        .on {
          display: none;
        }

        .off {
          display: inline-block;
          color: var(--color-text-active);
        }
      }

      & ~ input {
        box-sizing: border-box;
        width: 320px;
        padding: 0 8px;
        margin: 0;
        font-family: Verdana, sans-serif;
        font-size: @font-size4;
        color: @text-primary;
        color: var(--color-text-light);
        text-align: center;
        cursor: default;
        background: none;
        border: none;
        border-radius: 0;
        outline: none;
        appearance: none;
      }

      &:checked ~ input {
        font-size: 14px;
        color: @text-primary;
      }
    }
  }

  .cacheid-copy {
    position: relative;
    margin-left: 8px;

    i {
      margin-right: 6px;
    }

    &:hover {
      background-color: var(--color-button-secondary-hover);
    }

    &::before {
      position: absolute;
      top: -8px;
      left: 16px;
      padding: 4px 8px;
      color: @bg-secondary;
      content: 'Copied!';
      background-color: @text-primary;
      border-radius: 3px;
      opacity: 0;
      transition: all 0s;
    }

    &:active {
      &::before {
        opacity: 1;
        transition: all 0.3s;
        transform: scale(1.2) translateY(-8px);
      }
    }
  }
}

.button {
  & + & {
    margin-left: 16px;
  }
}
</style>
