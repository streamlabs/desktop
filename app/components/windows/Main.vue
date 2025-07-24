<template>
  <div class="main" :class="theme" id="mainWrapper" @drop="onDropHandler">
    <title-bar
      :componentProps="{ windowId: 'main' }"
      :class="{ 'titlebar--error': errorAlert }"
      v-if="uiReady"
    />
    <div
      class="main-contents"
      v-if="uiReady"
      :class="{
        'main-contents--right': renderDock && leftDock && hasLiveDock,
        'main-contents--left': renderDock && !leftDock && hasLiveDock,
        'main-contents--onboarding': page === 'Onboarding',
      }"
    >
      <side-nav
        v-if="page !== 'Onboarding' && !showLoadingSpinner"
        :locked="applicationLoading"
        class="sidenav"
      />
      <div class="live-dock-wrapper" v-if="renderDock && leftDock">
        <live-dock :component-props="{ onLeft: true }" />
        <resize-bar
          v-if="!isDockCollapsed"
          class="live-dock-resize-bar live-dock-resize-bar--left"
          position="right"
          @resizestart="onResizeStartHandler"
          @resizestop="onResizeStopHandler"
          :max="maxDockWidth"
          :min="minDockWidth"
          :value="liveDockSize"
        />
      </div>

      <div class="main-middle" :class="mainResponsiveClasses" ref="mainMiddle">
        <resize-observer @notify="handleResize" />
        <component
          class="main-page-container"
          v-if="!showLoadingSpinner"
          :is="page"
          :params="params"
          :component-props="{ onTotalWidth: width => handleEditorWidth(width), params }"
          @totalWidth="width => handleEditorWidth(width)"
          style="grid-row: 1 / span 1"
        />
        <studio-footer v-if="!applicationLoading && page !== 'Onboarding'" />
      </div>

      <div class="live-dock-wrapper" v-if="renderDock && !leftDock">
        <resize-bar
          v-if="!isDockCollapsed"
          class="live-dock-resize-bar"
          position="left"
          @resizestart="onResizeStartHandler"
          @resizestop="onResizeStopHandler"
          :max="maxDockWidth"
          :min="minDockWidth"
          :value="liveDockSize"
          :reverse="true"
        />
        <live-dock class="live-dock" />
      </div>
    </div>
    <ModalWrapper :renderFn="modalOptions.renderFn" />
    <transition name="loader">
      <div
        class="main-loading"
        :class="{ 'initial-loading': !uiReady }"
        v-if="!uiReady || showLoadingSpinner"
      >
        <custom-loader></custom-loader>
      </div>
    </transition>
  </div>
</template>

<script lang="ts" src="./Main.vue.ts"></script>

<style lang="less">
.main-middle--compact {
  .performance-metric-icon {
    height: 12px;
  }

  .performance-metric {
    font-size: 12px;
  }
}
</style>

<style lang="less" scoped>
@import '../../styles/index';

.sidenav {
  min-height: 100%;
  height: 100%;
  display: flex;
  flex-grow: 1;
}

.main {
  display: flex;
  flex-direction: column;
  position: relative;
  height: 100%;
}

.main-contents {
  display: grid;
  grid-template-columns: auto 1fr;
  flex-grow: 1;
  height: 100%;
}

.main-contents--right {
  grid-template-columns: auto auto 1fr;
}

.main-contents--left {
  grid-template-columns: auto 1fr auto;
}

.main-contents--onboarding {
  grid-template-columns: 1fr;

  .main-middle {
    grid-template-rows: 1fr;
  }
}

.main-middle {
  flex-grow: 1;
  display: grid;
  grid-template-rows: minmax(0, 1fr) 48px;
  position: relative;
  height: 100%;
}

.titlebar--error {
  background: var(--warning) !important;

  /deep/ div,
  /deep/ .titlebar-action {
    color: var(--white) !important;
  }
}

.main-page-container {
  /* Page always takes up remaining space */
  flex-grow: 1;
  display: flex;
  position: relative;
}

.main-loading {
  position: absolute;
  top: 30px;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 999999;
  background-color: var(--background);
  -webkit-app-region: drag;

  // Loader component is a fixed element that obscures the top bar
  /deep/ .s-loader__bg {
    top: 30px;
  }
}

.initial-loading {
  top: 0px !important;
}

.loader-enter-active,
.loader-leave-active {
  transition: opacity 0.5s ease-out;
}

.loader-enter,
.loader-leave-to {
  opacity: 0;
}

.live-dock {
  height: 100%;
}

.live-dock-wrapper {
  position: relative;
}

.live-dock-resize-bar {
  position: absolute;
  height: calc(100% - 20px);
  bottom: 0;
}

.live-dock-resize-bar--left {
  right: 0;
}

/deep/ .creator-sites-container .s-loader {
  .s-loader__bg {
    position: unset;
    z-index: unset;
  }
}
</style>
