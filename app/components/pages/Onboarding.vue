<template>
  <div class="onboarding">
    <component :is="currentView" />
  </div>
</template>

<script lang="ts" src="./Onboarding.vue.ts"></script>

<style lang="less">
@import url('../../styles/index');

.onboarding {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;

  .button--lg {
    width: 300px;
    padding: 0;
    .margin-top(2);
  }
}

.onboarding-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;

  .button--lg {
    &:first-child {
      margin-top: 0;
    }
  }
}

.onboarding-logo {
  width: 296px;
  margin-bottom: 40px;
}

.onboarding-step--wide {
  width: 1200px;
  margin: 0 auto;
}

.onboarding-step--full {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: inline-block;
  width: 100%;
}

.onboarding-title {
  font-size: 22px;
  color: @text-primary;
  .margin-bottom(3);
}

.onboarding-title--sm {
  font-size: 15px;
  .semibold;

  color: @white;
}

.onboarding-desc {
  padding: 0 20px;
  margin-bottom: 40px;
  color: var(--color-text);
}

.setup-later {
  margin-top: 20px;
  color: @text-primary;

  span {
    display: block;
    margin-bottom: 4px;
  }

  a {
    text-decoration: underline;
    .transition();

    &:hover {
      color: @white;
    }
  }
}

.running-setup-container {
  position: relative;
  width: 100%;
  height: 270px;
  padding: 30px;
  margin-bottom: 20px;
  color: @white;
  background-color: @bg-primary;
  .radius();

  &.optimizing {
    .running-setup-row {
      &:nth-child(1),
      &:nth-child(6) {
        color: #bbe380;
      }

      &:nth-child(2),
      &:nth-child(7) {
        color: #e98282;
      }

      &:nth-child(3),
      &:nth-child(8) {
        color: #79d88a;
      }

      &:nth-child(4),
      &:nth-child(9) {
        color: #7384ce;
      }

      &:nth-child(5),
      &:nth-child(10) {
        color: #b18f6d;
      }
    }
  }
}

.running-setup-row {
  display: flex;
  justify-content: space-between;
  width: 100%;
}

.running-setup-row--complete {
  color: @accent;
}

.running-setup-percent {
  color: @text-primary;
}

.running-setup__deco {
  position: absolute;
  top: 0;
  width: auto;
  height: 240px;
  margin: 16px 0;

  img {
    width: auto;
    height: 100%;
  }
}

.running-setup__deco--right {
  right: -90px;
}

.running-setup__deco--left {
  left: -90px;
}
</style>
