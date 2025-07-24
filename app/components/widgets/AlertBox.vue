<template>
  <widget-editor
    :navItems="navItems"
    :isAlertBox="true"
    :slots="[{ value: 'layout', label: $t('Layout') }]"
    :selectedVariation="selectedVariation"
    :selectedAlert="selectedAlert"
    :selectedId="selectedId"
  >
    <!-- Left Toolbar -->
    <div slot="leftbar" v-if="wData">
      <div class="left-accordion__button alert-button">
        <span class="button button--default add-alert-button" @click="toggleAddAlertMenu()">
          <i class="icon-add-circle" />{{ $t('Alert') }}
        </span>
        <div v-if="addAlertMenuOpen" class="add-alert-dropdown">
          <button
            v-for="type in alertTypes.filter(t => t !== 'facemasks')"
            class="button button--action"
            :key="type"
            @click="addAlert(type)"
          >
            {{ alertName(type) }}
          </button>
        </div>
      </div>
      <div
        class="left-accordion__button"
        :class="{ active: selectedAlert === 'general' }"
        @click="selectAlertType('general')"
      >
        {{ $t('Global Settings') }}
      </div>
      <div v-for="alert in alertTypes" :key="alert" style="position: relative">
        <div
          class="left-accordion__button"
          :class="{ active: selectedAlert === alert }"
          @click="selectAlertType(alert)"
        >
          <i
            :class="{
              'icon-add': selectedAlert !== alert,
              'icon-subtract': selectedAlert === alert,
            }"
          />
          <span class="left-accordion__title">{{ alertName(alert) }}</span>
        </div>
        <div class="left-accordion__input" v-if="wData.settings[alert]">
          <validated-form @input="save()"
            ><toggle-input v-model="wData.settings[alert].enabled"
          /></validated-form>
        </div>
        <div v-if="wData && selectedAlert === alert">
          <div
            v-for="variation in wData.settings[alert].variations"
            :key="variation.id"
            @click="selectVariation(variation.id)"
            class="variation-tile"
            :class="{ active: selectedId === variation.id }"
          >
            <div class="variation-tile__image-box">
              <img
                v-if="
                  variation.settings.image.href && !/\.webm/.test(variation.settings.image.href)
                "
                :src="variation.settings.image.href"
              />
              <video
                v-if="variation.settings.image.href && /\.webm/.test(variation.settings.image.href)"
                :key="variation.settings.image.href"
                loop
                muted
                autoplay
              >
                <source :src="variation.settings.image.href" type="video/webm" />
              </video>
              <div class="variation-tile__name">
                <input
                  type="text"
                  :value="variation.name"
                  :disabled="editingName !== variation.id"
                  :ref="`${variation.id}-name-input`"
                  @input="nameInputHandler($event.target.value)"
                  @blur="nameBlurHandler(variation.id)"
                />
              </div>
            </div>
            <div class="variation-tile__toolbar">
              <i
                v-if="!variation.id.includes('default')"
                class="icon-trash"
                @click.stop="removeVariation(variation.id)"
              />
              <i
                v-if="!variation.id.includes('default')"
                class="icon-edit"
                @click.stop="editName(variation.id)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <validated-form
      slot="layout"
      @input="save()"
      :key="`layout-${selectedAlert}-${selectedId}`"
      v-if="selectedVariation"
    >
      <alert-layout-input v-model="selectedVariation.settings.layout" />
    </validated-form>

    <!-- Global Settings -->
    <validated-form
      slot="general-properties"
      :key="`general-properties-${selectedAlert}-${selectedId}`"
      @input="save()"
      v-if="selectedVariation"
    >
      <v-form-group v-model="wData.settings.background_color" :metadata="metadata.bgColor" />
      <v-form-group v-model="wData.settings.alert_delay" :metadata="metadata.alertDelay" />
      <v-form-group v-model="wData.settings.interrupt_mode" :metadata="metadata.interruptMode" />
      <v-form-group
        v-if="wData.settings.interrupt_mode"
        v-model="wData.settings.interrupt_mode_delay"
        :metadata="metadata.interruptDelay"
      />
    </validated-form>
    <validated-form
      slot="moderation-properties"
      :key="`moderation-properties-${selectedAlert}-${selectedId}`"
      @input="save()"
      v-if="selectedVariation"
    >
      <v-form-group
        :value="wData.settings.moderation_delay === -1"
        @input="handleUnlimitedModerationDelay"
        :metadata="metadata.unlimitedAlertMod"
      />
      <v-form-group
        v-if="wData.settings.moderation_delay > -1"
        v-model="wData.settings.moderation_delay"
        :metadata="metadata.moderationDelay"
      />
    </validated-form>

    <!-- Alert-Specific Settings -->
    <validated-form
      slot="title-properties"
      :key="`title-properties-${selectedAlert}-${selectedId}`"
      @input="save()"
      v-if="selectedVariation"
    >
      <div v-if="selectedVariation.settings.text">
        <v-form-group
          v-model="selectedVariation.settings.text.format"
          :metadata="metadata.template"
        />
        <v-form-group
          v-model="selectedVariation.settings.text.font"
          :metadata="metadata.fontFamily"
        />
        <v-form-group
          v-model="selectedVariation.settings.text.size"
          :metadata="metadata.fontSize"
        />
        <v-form-group
          v-model="selectedVariation.settings.text.thickness"
          :metadata="metadata.textThickness"
        />
        <v-form-group
          v-model="selectedVariation.settings.text.color"
          :metadata="metadata.primaryColor"
        />
        <v-form-group
          v-model="selectedVariation.settings.text.color2"
          :metadata="metadata.secondaryColor"
        />
      </div>
    </validated-form>
    <validated-form
      slot="media-properties"
      :key="`media-properties--${selectedAlert}-${selectedId}`"
      @input="save()"
      v-if="selectedVariation"
    >
      <v-form-group
        v-model="selectedVariation.settings.useSkillImage"
        :metadata="metadata.skillImage"
        v-if="selectedVariation.settings.useSkillImage !== undefined"
      />
      <v-form-group
        v-model="selectedVariation.settings.image.href"
        :metadata="metadata.imageFile"
        v-if="selectedVariation.settings.image"
      />
      <v-form-group
        :metadata="metadata.soundFile"
        v-model="selectedVariation.settings.sound.href"
        v-if="selectedVariation.settings.sound"
      />
      <v-form-group
        v-model="selectedVariation.settings.sound.volume"
        :metadata="metadata.soundVolume"
        v-if="selectedVariation.settings.sound"
      />
    </validated-form>
    <validated-form
      slot="message-properties"
      :key="`message-properties-${selectedAlert}-${selectedId}`"
      @input="save()"
      v-if="selectedVariation"
    >
      <v-form-group
        v-if="wData.settings[selectedAlert]"
        v-model="wData.settings[selectedAlert].showMessage"
        :metadata="metadata.showMessage"
      />
      <div v-if="selectedVariation.settings.message">
        <v-form-group
          v-model="selectedVariation.settings.message.minAmount"
          :metadata="metadata.minAmount"
        />
        <v-form-group
          v-model="selectedVariation.settings.message.font"
          :metadata="metadata.fontFamily"
        />
        <v-form-group
          v-model="selectedVariation.settings.message.size"
          :metadata="metadata.fontSize"
        />
        <v-form-group
          v-model="selectedVariation.settings.message.weight"
          :metadata="metadata.messageWeight"
        />
        <v-form-group
          v-model="selectedVariation.settings.message.color"
          :metadata="metadata.textColor"
        />
        <v-form-group
          v-model="selectedVariation.settings.message.allowEmojis"
          :metadata="metadata.messageEmojis"
        />
      </div>
      <div v-if="selectedVariation.settings.tts && selectedAlert !== 'merch'">
        <span>{{ $t('Text to Speech') }}</span>
        <v-form-group
          v-model="selectedVariation.settings.tts.enabled"
          :metadata="metadata.ttsEnabled"
        />
        <v-form-group
          v-model="selectedVariation.settings.tts.minAmount"
          :metadata="metadata.ttsMinAmount"
        />
        <v-form-group
          v-model="selectedVariation.settings.tts.volume"
          :metadata="metadata.ttsVolume"
        />
        <v-form-group
          v-model="selectedVariation.settings.tts.language"
          :metadata="metadata.ttsLanguage"
        />
        <v-form-group
          v-model="selectedVariation.settings.tts.security"
          :metadata="metadata.ttsSecurity"
        />
      </div>
    </validated-form>
    <validated-form
      slot="animation-properties"
      :key="`animation-properties-${selectedAlert}-${selectedId}`"
      @input="save()"
      v-if="selectedVariation"
    >
      <v-form-group
        v-model="selectedVariation.settings.showAnimation"
        :metadata="metadata.showAnimation"
      />
      <v-form-group
        v-model="selectedVariation.settings.hideAnimation"
        :metadata="metadata.hideAnimation"
      />
      <v-form-group v-model="selectedVariation.settings.duration" :metadata="metadata.duration" />
      <v-form-group
        v-model="selectedVariation.settings.text.animation"
        :metadata="metadata.textAnimation"
        v-if="selectedVariation.settings.text"
      />
      <v-form-group v-model="selectedVariation.settings.textDelay" :metadata="metadata.textDelay" />
    </validated-form>
    <validated-form
      slot="alert-properties"
      :key="`alert-properties-${selectedAlert}-${selectedId}`"
      @input="save()"
      v-if="selectedVariation"
    >
      <v-form-group
        v-model="selectedVariation.settings.sparksEnabled"
        :metadata="metadata.sparksEnabled"
        v-if="selectedVariation.settings.sparksEnabled !== undefined"
      />
      <v-form-group
        v-model="selectedVariation.settings.minSparksTrigger"
        :metadata="metadata.minSparksTrigger"
        v-if="selectedVariation.settings.minSparksTrigger !== undefined"
      />
      <v-form-group
        v-model="selectedVariation.settings.embersEnabled"
        :metadata="metadata.embersEnabled"
        v-if="selectedVariation.settings.embersEnabled !== undefined"
      />
      <v-form-group
        v-model="selectedVariation.settings.minEmbersTrigger"
        :metadata="metadata.minEmbersTrigger"
        v-if="selectedVariation.settings.minEmbersTrigger !== undefined"
      />
      <v-form-group
        v-model="minTriggerAmount"
        :metadata="metadata.minTriggerAmount"
        v-if="['donations', 'raids', 'bits'].includes(selectedAlert)"
      />
      <v-form-group
        v-model="minRecentEvents"
        :metadata="metadata.minRecentEvents"
        v-if="['donations'].includes(selectedAlert)"
      />
      <div v-if="!selectedId.includes('default')">
        <v-form-group v-model="selectedVariation.condition" :metadata="metadata.conditions" />
        <v-form-group v-model="selectedVariation.conditionData" :metadata="metadata.variations" />
      </div>
    </validated-form>
  </widget-editor>
</template>

<script lang="ts" src="./AlertBox.vue.ts"></script>

<style lang="less" scoped>
@import '../../styles/index';

.left-accordion__button {
  .padding();
  .weight(@medium);

  display: flex;
  border-bottom: 1px solid var(--border);
  position: relative;
  align-items: center;

  i {
    font-size: 12px;
    .margin-right();
  }

  &:hover {
    cursor: pointer;
  }
}

.left-accordion__button.alert-button {
  padding: 7.5px;
}

.left-accordion__button.active {
  background-color: var(--section);
}

.add-alert-button {
  width: 100%;
}

.add-alert-dropdown {
  .padding();

  position: absolute;
  left: 0;
  top: 50px;
  background-color: var(--background);
  z-index: 1;
  box-shadow: 0 2px var(--shadow);
  width: 100%;

  .button {
    display: block;
    width: 100%;
    line-height: 12px;
    margin-bottom: 4px;
  }
}

.left-accordion__title {
  width: 100px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-left: 4px;
}

.left-accordion__input {
  position: absolute;
  top: 10px;
  right: 8px;
}

.leftbar {
  display: flex;
  flex-direction: column;
}

.variation-tile {
  .radius();

  width: 90%;
  margin: 8px auto;
  box-shadow: 0 2px var(--shadow);
  border: 1px solid var(--border);
  background-color: var(--section-alt);
  height: 100px;
  position: relative;
  .padding();

  img,
  video {
    height: 60px;
    margin: 0 auto;
    display: block;
  }

  &:hover {
    cursor: pointer;
  }
}

.variation-tile.active {
  border: 1px solid var(--teal);

  .variation-tile__image-box {
    border: 1px solid var(--teal-semi);
  }
}

.variation-tile__image-box {
  width: 100%;
  display: block;
  height: 60px;
  margin: 4px auto;
  overflow: hidden;
  position: relative;
}

.variation-tile__name {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 100%;
  padding: 4px;
  background-color: var(--shadow);

  input,
  input:disabled {
    background-color: transparent;
    border: none;
    cursor: pointer;
  }
}

.variation-tile__toolbar {
  display: flex;
  justify-content: flex-end;
  padding-top: 2px;

  i {
    margin-left: 4px;
  }
}
</style>
