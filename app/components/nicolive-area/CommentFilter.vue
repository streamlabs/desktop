<template>
  <div class="container">
    <div class="header">
      <p class="header-title">配信用ブロック設定</p>
      <span class="registrations">（登録数 {{ count }}/{{ maxCount }}）</span>
      <i class="icon-close icon-btn" @click="close"></i>
    </div>
    <div class="content">
      <div class="tab-list">
        <popper
          trigger="click"
          :options="{ placement: 'bottom' }"
          @show="
            showPopupMenu = true;
            popper = $event;
          "
          @hide="showPopupMenu = false"
        >
          <div class="popper">
            <ul class="popup-menu-list">
              <li
                class="popup-menu-item"
                :class="{ active: currentFilterBy === 'all' }"
                @click="
                  currentFilterBy = 'all';
                  popper.doClose();
                "
              >
                <span>すべて</span>
              </li>
              <li
                class="popup-menu-item"
                :class="{ active: currentFilterBy === 'broadcaster' }"
                @click="
                  currentFilterBy = 'broadcaster';
                  popper.doClose();
                "
              >
                <span>放送者が登録</span>
              </li>
              <li
                class="popup-menu-item"
                :class="{ active: currentFilterBy === 'moderator' }"
                @click="
                  currentFilterBy = 'moderator';
                  popper.doClose();
                "
              >
                <span>モデレーターが登録</span>
              </li>
            </ul>
          </div>

          <div class="indicator" :class="{ 'is-show': showPopupMenu }" slot="reference">
            <i class="icon-adjuster icon-btn" v-tooltip.bottom="adjusterTooltip"></i>
          </div>
        </popper>

        <button
          type="button"
          @click="currentType = 'word'"
          class="button--tab"
          :class="{ active: currentType === 'word' }"
        >
          コメント
        </button>
        <button
          type="button"
          @click="currentType = 'user'"
          class="button--tab"
          :class="{ active: currentType === 'user' }"
        >
          ユーザーID
        </button>
        <button
          type="button"
          @click="currentType = 'command'"
          class="button--tab"
          :class="{ active: currentType === 'command' }"
        >
          コマンド
        </button>
      </div>
      <form class="add-form" @submit.prevent="onAdd">
        <input
          type="text"
          ref="input"
          v-model="newFilterValue"
          :placeholder="PLACEHOLDER[currentType]"
          :disabled="adding"
          :readonly="adding"
          :class="{ 'is-error': invalid }"
        />
        <button
          type="submit"
          :disabled="!newFilterValue || adding || invalid"
          class="button button--secondary"
        >
          登録
        </button>
        <div class="form-tip floating-wrapper" v-if="invalid">
          不正なユーザーIDです。入力内容を確認してください。
        </div>
      </form>
      <div class="list">
        <div class="item row" v-for="item of currentTypeFilters" :key="item.id">
          <div class="item-box">
            <div class="item-body" :title="item.body">{{ item.body }}</div>
            <div class="item-content" v-if="item.comment_body" :title="item.comment_body">
              {{ item.comment_body }}
            </div>
            <div class="item-content" :title="item.register_by" :v-if="item.register_by">
              {{ item.register_by }}
            </div>
            <div class="item-content" :title="item.register_date">{{ item.register_date }}</div>
          </div>
          <button
            type="button"
            class="item-misc icon-btn icon-delete"
            :disabled="deleting"
            @click="deleteFilter(item)"
          ></button>
        </div>
        <div class="empty-content" v-show="numberOfEntries === 0">
          <svg
            width="59"
            height="65"
            viewBox="0 0 59 65"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <g opacity="0.58">
              <path
                opacity="0.25"
                d="M23.8392 30.228L56.4934 36.777L43.4316 43.3254L10.7773 36.777L23.8392 30.228Z"
                fill="#91979A"
              />
              <path
                fill-rule="evenodd"
                clip-rule="evenodd"
                d="M46.0585 33.1969L45.9237 33.1969L23.9435 28.7884C23.941 28.7884 23.9391 28.7877 23.9372 28.7877L23.9315 28.7864C23.8318 28.7654 23.7315 28.7578 23.6306 28.7565C23.6278 28.7565 23.6251 28.7561 23.6222 28.7556L23.6182 28.755C23.6165 28.7548 23.6147 28.7546 23.6129 28.7546C23.6035 28.7546 23.5945 28.756 23.5854 28.7575C23.5772 28.7588 23.5689 28.7601 23.5602 28.7604C23.4828 28.7623 23.4053 28.7693 23.3292 28.7833C23.302 28.7878 23.2761 28.7939 23.25 28.8001L23.2295 28.8049C23.1661 28.8202 23.1051 28.8399 23.0436 28.8634C23.0087 28.8762 22.975 28.8889 22.9414 28.9042C22.9368 28.9063 22.9322 28.9082 22.9274 28.91L22.9147 28.9147C22.9051 28.9181 22.8956 28.9216 22.8868 28.9258L9.82625 35.4742C9.82487 35.4748 9.82355 35.4755 9.82226 35.4763L9.81847 35.4787L9.81355 35.4818C9.71899 35.5302 9.63268 35.5894 9.55081 35.6536C9.54653 35.657 9.54182 35.6598 9.53702 35.6626L9.53697 35.6627C9.5318 35.6657 9.52654 35.6688 9.52161 35.6727C9.51657 35.6772 9.51207 35.6822 9.50755 35.6873L9.50751 35.6873C9.50238 35.6931 9.49721 35.6989 9.49115 35.7039C9.42007 35.7657 9.3547 35.8325 9.29568 35.905C9.29098 35.9109 9.28587 35.9164 9.28073 35.9219L9.27687 35.9261L9.27049 35.9331C9.26803 35.936 9.26562 35.9389 9.26331 35.9419C9.19921 36.0266 9.14463 36.1176 9.09703 36.2124C9.09095 36.2249 9.08568 36.2377 9.08043 36.2504L9.0804 36.2505L9.07656 36.2597C9.07374 36.2665 9.07087 36.2732 9.06783 36.2799C9.03293 36.36 9.00437 36.4428 8.98279 36.5287C8.98028 36.5387 8.97741 36.5485 8.97455 36.5583C8.97088 36.5708 8.96723 36.5833 8.96439 36.5961C8.94281 36.7011 8.93011 36.808 8.92948 36.9169L8.9293 36.9198L8.92848 36.9247C8.92802 36.927 8.92758 36.9294 8.92758 36.9315V56.5773C8.92758 57.3536 9.47338 58.0219 10.2324 58.174L14.8146 59.0935C15.6873 59.2698 16.5498 58.6983 16.7256 57.8163C16.9014 56.9343 16.3315 56.0758 15.4518 55.9002L12.1751 55.2428V38.9177L41.5818 44.815V61.1401L30.2729 58.8721C29.3996 58.6951 28.5378 59.2666 28.362 60.1493C28.1862 61.0313 28.7561 61.8891 29.6357 62.0654L42.8873 64.723C42.9933 64.7446 43.0999 64.7548 43.2059 64.7548C43.3176 64.7548 43.4281 64.7395 43.5372 64.7172C43.5477 64.715 43.558 64.7125 43.5682 64.7098C43.5828 64.7059 43.597 64.7017 43.6112 64.6975L43.633 64.6911C43.7156 64.6689 43.7949 64.6396 43.8723 64.6052C43.8893 64.5975 43.9073 64.5936 43.9242 64.5869L43.932 64.5836L56.9938 58.0346C57.544 57.7584 57.8912 57.1946 57.8912 56.5773V36.9315C57.8912 36.9257 57.8901 36.9199 57.889 36.914C57.888 36.9089 57.8871 36.9037 57.8868 36.8984L57.8865 36.8834V36.8832C57.8853 36.8273 57.8842 36.7718 57.8772 36.7158C57.8717 36.6725 57.8612 36.6308 57.8507 36.5891L57.843 36.5579L57.8405 36.5467L57.8381 36.5341L57.8381 36.534L57.8381 36.534C57.8359 36.5229 57.8339 36.512 57.8309 36.5013C57.7992 36.3836 57.7535 36.2728 57.6976 36.1672C57.6893 36.1524 57.6807 36.1379 57.6719 36.1233L57.6621 36.1068C57.5999 36.0011 57.5301 35.9012 57.4463 35.8127C57.4433 35.8092 57.4393 35.806 57.4357 35.8027L57.4333 35.8005L57.4311 35.7981C57.3479 35.7122 57.254 35.6384 57.1537 35.5728C57.1485 35.5694 57.1439 35.5651 57.1392 35.5608C57.1336 35.5557 57.1279 35.5506 57.1214 35.5467C57.1181 35.5444 57.1143 35.543 57.1105 35.5415C57.1068 35.5401 57.1032 35.5387 57.0998 35.5366C56.9982 35.4755 56.8891 35.4265 56.7742 35.3889C56.756 35.3828 56.738 35.3779 56.72 35.373L56.6949 35.366C56.681 35.3623 56.6673 35.358 56.6536 35.3537C56.6316 35.3467 56.6094 35.3398 56.5864 35.3355L52.4925 34.5144C54.366 32.3102 55.5207 29.1544 55.5207 25.5964C55.5207 18.7793 51.2816 13.4392 45.8701 13.4392L41.5403 13.4338V12.1323C43.8754 11.3019 45.5577 9.07623 45.5577 6.43843C45.5577 3.09334 42.8669 0.381836 39.5478 0.381836C36.2288 0.381836 33.538 3.09334 33.538 6.43843C33.538 9.08549 35.2314 11.3181 37.5795 12.1416V13.4377L30.8487 13.4396C29.5163 13.4396 28.4209 14.4606 28.4209 15.8035C28.4209 17.1463 29.5163 18.1318 30.8487 18.1318H46.0585C48.7233 18.1318 50.9849 21.5548 50.9849 25.5833C50.9849 29.6122 48.7233 33.1969 46.0585 33.1969ZM20.5797 56.9109C19.7064 56.7251 18.8414 57.2908 18.658 58.1716C18.4746 59.0517 19.0375 59.9146 19.9152 60.0986L21.8243 60.4988C21.936 60.5224 22.0483 60.5338 22.1587 60.5338C22.9108 60.5338 23.5867 60.0063 23.7466 59.2382C23.9301 58.3581 23.3671 57.4951 22.4888 57.3106L20.5797 56.9109ZM54.6437 39.5668L47.5419 43.1273L44.8294 44.4866V60.4917L54.6437 55.5711V39.5668ZM21.9894 33.0178V37.5647L15.5115 36.2659L21.9894 33.0178ZM51.3067 37.5978L25.2369 32.3686V38.2157L42.9774 41.7737L43.2104 41.6566L51.3067 37.5978ZM5.57546 32.1622C5.79568 32.3856 6.08635 32.4976 6.37639 32.4976C6.66135 32.4976 6.94694 32.3894 7.1659 32.173C7.60825 31.7358 7.6127 31.0218 7.17732 30.5782L6.09524 29.4786C5.6586 29.0357 4.94588 29.0312 4.50479 29.4671C4.06244 29.905 4.058 30.619 4.49337 31.0619L5.57546 32.1622ZM10.3529 29.4343C9.82491 29.4343 9.35336 29.0589 9.24992 28.5199L8.9383 26.8977C8.82152 26.2862 9.22072 25.695 9.83063 25.5766C10.4418 25.4601 11.0301 25.8598 11.1475 26.4713L11.4585 28.0935C11.5759 28.7051 11.1767 29.2956 10.5668 29.414C10.4951 29.4273 10.4234 29.4343 10.3529 29.4343ZM3.13267 36.516C3.20946 36.5313 3.28625 36.5396 3.36178 36.5396C3.88347 36.5396 4.35184 36.173 4.46164 35.6404C4.58793 35.0307 4.19635 34.4338 3.58835 34.3071L1.97569 33.9724C1.36896 33.8496 0.773021 34.2384 0.646725 34.8481C0.520429 35.4577 0.912011 36.054 1.52001 36.1813L3.13267 36.516ZM19.4848 21.5387C20.1079 21.2335 20.8108 21.1852 21.4636 21.4033C22.1237 21.6231 22.656 22.0908 22.9619 22.7205C23.2695 23.351 23.3116 24.0632 23.0812 24.7256C22.9542 25.0911 22.7534 25.4159 22.4937 25.6856C22.2852 25.9021 22.0388 26.0828 21.7611 26.2182C21.1398 26.5225 20.4377 26.5645 19.7851 26.336C19.1312 26.1081 18.6019 25.6344 18.2956 25.0034C17.9884 24.3733 17.9442 23.667 18.1712 23.0145C18.396 22.367 18.8631 21.8426 19.4848 21.5387ZM21.2256 8.66294C20.0162 6.17638 16.7376 4.66486 12.8114 6.58512C7.82553 9.02214 7.9401 13.3601 8.77569 15.0795C9.10106 15.7476 9.64532 16.0985 10.3495 16.0938C10.7704 16.091 11.2391 15.9644 11.7433 15.7175C12.7073 15.2479 13.6199 14.4038 13.2917 13.4428L13.2905 13.4397C13.0275 12.7315 12.5394 11.4176 14.4814 10.4669C15.6082 9.91701 16.5079 10.0556 16.8887 10.8384C17.2564 11.596 16.9215 12.2544 15.927 14.2092L15.927 14.2093L15.9267 14.21L15.8451 14.3707C14.6176 16.7712 15.576 18.7405 15.9372 19.4822C16.5773 20.7973 17.3326 21.4367 19.119 20.5629C19.5004 20.3767 19.7823 20.1719 19.9873 19.959C20.8536 19.0595 20.3425 18.0072 20.0971 17.5025C19.5697 16.4176 19.8138 15.8719 20.3491 14.6776C21.6439 11.8105 22.1794 10.6243 21.2256 8.66294ZM38.7029 27.379C38.974 27.078 39.4438 27.078 39.7152 27.379L41.8907 29.791C42.1801 30.1121 41.9542 30.6265 41.5239 30.6265H36.8939C36.4635 30.6265 36.238 30.1121 36.5271 29.791L38.7029 27.379ZM45.7774 20.8884C44.6008 20.8884 43.6471 21.8496 43.6471 23.0349C43.6471 24.2207 44.6008 25.1819 45.7774 25.1819C46.954 25.1819 47.9077 24.2207 47.9077 23.0353C47.9077 21.8496 46.954 20.8884 45.7774 20.8884ZM30.3056 24.9756C30.3056 23.7902 31.2594 22.829 32.4359 22.829C33.6125 22.829 34.5662 23.7902 34.5662 24.9756C34.5662 26.1614 33.6125 27.1226 32.4359 27.1226C31.2594 27.1226 30.3056 26.1614 30.3056 24.9756ZM39.5658 4.17801C40.8136 4.17801 41.8255 5.19748 41.8255 6.45541C41.8255 7.71334 40.8136 8.73281 39.5658 8.73281C38.3177 8.73281 37.3058 7.71334 37.3058 6.45541C37.3058 5.19748 38.3177 4.17801 39.5658 4.17801Z"
                fill="currentColor"
              />
            </g>
          </svg>
          <p class="empty-message">登録されていません</p>
          <button
            type="button"
            class="button button--round button--secondary"
            v-show="isEmptyBecauseOfFilterBy"
            @click="currentFilterBy = 'all'"
          >
            絞り込みを解除
          </button>
        </div>
      </div>
      <div class="status-bar">
        {{ currentFilterName }}{{ FILTER_VALUE[currentType] }}登録数：{{ numberOfEntries }}
      </div>
    </div>
  </div>
</template>

<script lang="ts" src="./CommentFilter.vue.ts"></script>
<style lang="less" scoped>
@import url('../../styles/index');

.container {
  display: flex;
  flex-basis: 0;
  flex-direction: column;
  flex-grow: 1;
  width: 100%;
  overflow-y: auto;
}

.header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  height: 48px;
  padding: 4px 16px;
  color: var(--color-text-light);
  .bold;

  border-bottom: 1px solid var(--color-border-light);

  > .header-title {
    margin: 0;
    font-size: @font-size4;
    color: var(--color-text-light);
    text-align: center;
  }

  > .icon-close {
    position: absolute;
    right: 16px;
    display: flex;
    align-items: center;
  }
}

.content {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
}

.tab-list {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  height: 40px;
  padding: 0 16px;
  border-bottom: 1px solid @border;

  > button {
    flex-grow: 1;
    height: 100%;
  }
}

.add-form {
  position: relative;
  display: flex;
  flex-shrink: 0;
  justify-content: center;
  height: 72px;
  padding: 16px;
  border-bottom: 1px solid var(--color-border-light);

  > input {
    box-sizing: border-box;
    flex-grow: 1;
    width: auto;
    height: 100%;
    padding: 0 12px;
    border-radius: 4px 0 0 4px;

    &::placeholder {
      color: var(--color-text-dark);
    }
  }

  > button {
    flex-shrink: 0;
    height: 100%;
    border-radius: 0 4px 4px 0;
  }
}

.floating-wrapper {
  position: absolute;
  top: 64px;
  right: 0;
  left: 16px;
}

.list {
  display: flex;
  flex-basis: 0;
  flex-direction: column;
  flex-grow: 1;
  overflow-y: auto;
}

.empty-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  margin: auto;
  color: var(--color-text-dark);

  svg {
    margin-left: -10px;
  }
}

.empty-message {
  margin: 12px 0 16px;
  color: var(--color-text-dark);
}

.row {
  display: flex;
  flex-direction: row;
  width: 100%;
  font-size: @font-size4;

  &:hover {
    .bg-hover();

    .item-misc {
      display: flex;
    }
  }
}

.item {
  padding: 12px 16px;
}

.item-box {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
}

.item-body {
  font-size: @font-size4;
  line-height: @font-line-height-normal;
  color: var(--color-text);
  word-break: break-all;
}

.item-content {
  flex-shrink: 0;
  margin-top: 4px;
  font-size: @font-size2;
  line-height: @font-line-height-normal;
  color: var(--color-text-dark);

  &:empty {
    display: none;
  }
}

.item-misc {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
}

.status-bar {
  display: flex;
  justify-content: center;
  padding: 8px 16px;
  font-size: @font-size2;
  text-align: center;
  background-color: var(--color-bg-secondary);
}

.banner {
  position: absolute;
  right: 16px;
  bottom: 16px;
  left: 16px;
  .shadow;
}

.indicator {
  .transition;

  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 12px 0 -4px;
  cursor: pointer;

  i {
    font-size: @font-size6;
  }

  &.is-show {
    i {
      color: var(--color-text-active);
    }
  }
}

.popper {
  .popper-styling;
}
</style>
