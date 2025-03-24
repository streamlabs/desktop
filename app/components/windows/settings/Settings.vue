<template>
  <modal-layout
    :show-cancel="false"
    :done-handler="done"
    class="modal-layout--w-side-menu"
    :contentStyles="{ padding: '0' }"
  >
    <div slot="content" class="settings">
      <NavMenu v-model="categoryName" class="settings-nav">
        <scrollable style="height: 100%" :isResizable="false">
          <form-input
            :value="searchStr"
            @input="str => onSearchInput(str)"
            :metadata="{
              type: 'text',
              placeholder: 'Search',
              icon: 'search',
            }"
            class="search"
          />
          <button
            class="button button--default clear-search-button"
            v-if="searchStr"
            @click="searchStr = ''"
          >
            <i class="fa fa-times"></i>
          </button>
          <NavItem
            v-for="category in categoryNames"
            :key="category"
            :to="category"
            :ico="icons[category]"
            :class="{ disabled: searchStr && !searchResultPages.includes(category) }"
          >
            <div :style="{ display: 'flex' }" @click="dismiss(category)">
              {{ $t(category) }}
              <NewBadge
                v-if="
                  dismissables[category] &&
                  dismissablesService.views.shouldShow(dismissables[category])
                "
                :componentProps="{ dismissableKey: 'custom_menu_settings' }"
              />
            </div>
          </NavItem>
          <NavItem
            key="Prime"
            to="Ultra"
            :ultra="true"
            :class="{ disabled: searchStr && !searchResultPages.includes('ultra') }"
          >
            Ultra
          </NavItem>
          <div
            class="settings-auth"
            @click="handleAuth()"
            v-track-click="{
              component: 'Settings',
              target: userService.isLoggedIn ? 'logout' : 'login',
            }"
          >
            <i :class="userService.isLoggedIn ? 'fas fa-sign-out-alt' : 'fas fa-sign-in-alt'" />
            <strong>{{ userService.isLoggedIn ? $t('Log Out') : $t('Log In') }}</strong>
            <platform-logo
              v-if="userService.isLoggedIn"
              :componentProps="{ platform: userService.platform.type, size: 'small' }"
            />
            <span v-if="userService.isLoggedIn">{{ userService.username }}</span>
          </div>
        </scrollable>
      </NavMenu>

      <scrollable className="settings-container">
        <searchable-pages
          ref="settingsContainer"
          :page="categoryName"
          :pages="categoryNames"
          :searchStr="searchStr"
          :onBeforePageScan="onBeforePageScanHandler"
          :onPageRender="onPageRenderHandler"
          @searchCompleted="onSearchCompletedHandler"
          @scanCompleted="onScanCompletedHandler"
          v-slot:default="{ page, scanning }"
        >
          <Hotkeys
            v-if="page === 'Hotkeys'"
            :componentProps="{
              highlightSearch,
              scanning,
              globalSearchStr: scanning ? '' : searchStr,
            }"
          />
          <developer-settings v-if="page === 'Developer'" />
          <installed-apps v-if="page === 'Installed Apps'" />
          <overlay-settings v-if="page === 'Scene Collections'" />
          <notifications-settings v-if="page === 'Notifications'" />
          <ObsSettings v-if="shouldShowReactPage" :componentProps="{ page: page }" />
          <GenericFormGroups
            v-if="shouldShowVuePage"
            :key="page"
            :categoryName="page"
            :value="settingsData"
            @input="save"
          />
        </searchable-pages>
      </scrollable>
    </div>
  </modal-layout>
</template>

<script lang="ts" src="./Settings.vue.ts"></script>

<style lang="less" scoped>
@import '../../../styles/index';
@import '../../../styles/badges';

.settings {
  & /deep/ h2 {
    // reset 'capitalize' transform that works weird when text has a highlight caused by the search
    text-transform: none;
  }

  display: flex;
  align-content: stretch;
  align-items: stretch;
  flex: 1;
  height: 100%;

  .search {
    width: 100%;
    .margin-left(2);
    .margin-bottom(2);
    & /deep/ input {
      padding-left: 30px;
      width: calc(100% - 30px);
    }
    & /deep/ .fa {
      position: absolute;
      left: 0;
      right: auto;
      pointer-events: none;
    }
  }

  .clear-search-button {
    position: absolute;
    left: 188px;
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    top: 0;

    i {
      margin-right: 0;
    }
  }

  .disabled {
    opacity: 0.2;
  }
}

.settings-container {
  .padding-right(2);
  .padding-top(2);

  flex-grow: 1;
}

.settings-nav {
  margin-bottom: 48px;
}

.settings-auth {
  cursor: pointer;
  border-left: 1px solid transparent;
  padding-left: 24px;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  position: fixed;
  bottom: 40px;
  padding-top: 16px;
  padding-bottom: 16px;
  width: 240px;
  border-top: 1px solid var(--border);
  background: var(--background);

  span {
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
  }

  i,
  .react {
    margin-right: 8px;
  }
  strong {
    margin-right: 16px;
    white-space: nowrap;
  }
}
</style>

<style lang="less">
.settings-container {
  .input-container,
  .alignable-input {
    flex-direction: column;

    .input-label,
    .input-wrapper,
    .input-body {
      width: 100%;
    }

    .bitmask-input > div {
      width: auto;
    }

    .input-label {
      label {
        margin-bottom: 8px;
        line-height: 16px;
      }
    }
  }
}
</style>
