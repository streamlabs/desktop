<template>
  <span class="text-center">
    <div class="timer-wrapper inline-block">
      <div style="padding-right: 2px">
        <div
          class="timer cursor-pointer"
          :class="{ wide: hasHours && hasSeconds }"
          @click="showTimerDropdown = !showTimerDropdown"
        >
          <div v-if="hasHours">
            {{ getHours(max >= value && value >= min ? value : min) }}
          </div>
          <div v-if="hasHours">:</div>
          <div>
            {{ getMinutes(max >= value && value >= min ? value : min) }}
          </div>
          <div v-if="hasSeconds">:</div>
          <div v-if="hasSeconds">
            {{ getSeconds(max >= value && value >= min ? value : min) }}
          </div>
        </div>
        <div
          class="timer-icon-top"
          @mousedown="beginHold(increment, hasSeconds ? second : minute)"
          @mouseup="releaseHold()"
          @mouseout="releaseHold()"
        >
          <i class="fas fa-chevron-up"></i>
        </div>
        <div
          class="timer-icon-bottom"
          @mousedown="beginHold(decrement, hasSeconds ? second : minute)"
          @mouseup="releaseHold()"
          @mouseout="releaseHold()"
        >
          <i class="fas fa-chevron-down"></i>
        </div>
      </div>

      <div
        v-if="showTimerDropdown"
        class="timer timer-dropdown"
        :class="{ wide: hasHours && hasSeconds }"
      >
        <div v-if="hasHours" class="time-slot-box">
          <p class="text-center bold">{{ $t('common.Hr') }}</p>
          <a
            class="text-center time-slot"
            v-for="hour in hours"
            :key="hour"
            :class="{ active: isActiveHour(hour) }"
            @click="setHour(hour)"
          >
            {{ hour }}
          </a>
        </div>
        <div class="time-slot-box">
          <p class="text-center bold">{{ $t('common.Min') }}</p>
          <a
            class="text-center time-slot"
            v-for="minute in minutes"
            :key="minute"
            @click="setMinute(minute)"
            :class="{ active: isActiveMinute(minute) }"
          >
            {{ minute }}
          </a>
        </div>
        <div v-if="hasSeconds" class="time-slot-box">
          <p class="text-center bold">{{ $t('common.Sec') }}</p>
          <a
            class="text-center time-slot"
            v-for="second in seconds"
            :key="second"
            @click="setSecond(second)"
            :class="{ active: isActiveSecond(second) }"
          >
            {{ second }}
          </a>
        </div>
      </div>

      <div class="timer-footer">
        <div v-if="hasHours">
          {{ $t('Hr') }}
        </div>
        <div>
          {{ $t('Min') }}
        </div>
        <div v-if="hasSeconds">
          {{ $t('Sec') }}
        </div>
        <div>&nbsp;</div>
      </div>
    </div>
  </span>
</template>

<script lang="ts" src="./TimerInput.vue.ts"></script>

<style lang="less" scoped>
@import url('../../../styles/index');

.timer-wrapper {
  position: relative;
  width: auto;
}

.timer {
  position: relative;
  display: flex;
  justify-content: flex-start;
  width: 90px;
  padding: 5px 0;
  padding-left: 8px;
  font-family: Roboto;
  font-size: 14px;
  background: @day-button;
  border: 1px solid transparent;
  box-shadow: none;
  .radius();

  &:active,
  &:focus {
    background-color: @day-button;
    border-color: transparent;
    outline: none;
    box-shadow: none;
  }

  i {
    font-size: 11px;
    cursor: pointer;
  }

  div {
    margin-right: 8px;
  }
}

.timer-icon-top,
.timer-icon-bottom {
  position: absolute;
  right: 8px;

  &:hover {
    cursor: pointer;
  }
}

.timer-icon-top {
  top: -2px;
}

.timer-icon-bottom {
  bottom: 17px;
}

.fa-xs {
  font-size: 0.75em !important;
}

.timer-dropdown {
  position: absolute;
  left: 0;
  z-index: 10;
  width: 90px;
  padding: 0;
  margin-top: 2px;
  overflow-y: hidden;
  .radius();
}

.timer.wide,
.timer-dropdown.wide {
  width: 120px;
}

.time-slot-box {
  height: 200px;
  padding: 10px;
  margin: 0 !important;
  overflow-y: auto;
}

.time-slot {
  display: block;
  padding: 5px 0;
}

.cursor-pointer {
  cursor: pointer;
}

.active {
  background: rgba(0, 0, 0, 40%);
  border-radius: 4px;
}

.inline-block {
  display: inline-block;
}

.timer-footer {
  display: flex;
  justify-content: space-around;
}

.night-theme {
  .timer {
    color: @white;
    background: @night-button;
    border-color: transparent;
    box-shadow: none;

    &:active,
    &:focus {
      background: @night-button;
      border-color: transparent;
      box-shadow: none;
    }
  }
}
</style>
