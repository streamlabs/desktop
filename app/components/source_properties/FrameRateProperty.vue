<template>
  <div :class="{ 'FrameRate-container__disabled': !property.enabled }">
    <label>{{ property.description }}</label>
    <div>
      <tabs :tabs="tabs" style="margin-bottom: 10px">
        <div slot="simple" class="FrameRate-simple">
          <select @change="setSimpleValue">
            <option
              v-for="(option, index) in simpleOptions"
              :key="option.name"
              :value="index"
              :selected="selectedSimpleOptionIndex === index"
            >
              {{ option.name }}
            </option>
          </select>
        </div>
        <div slot="rational" class="row FrameRate-rational">
          <div class="small-6 column">
            <label>Numerator</label>
            <input ref="numerator" type="text" :value="numerator" @change="setRationalValue" />
            <label>Denominator</label>
            <input ref="denominator" type="text" :value="denominator" @change="setRationalValue" />
          </div>
          <div class="small-6 column">
            <ul class="FrameRate-rationalStats">
              <li>FPS: {{ framesPerSecond }}</li>
              <li>Frame Interval: {{ frameIntervalMilliseconds }}</li>
              <li>Min FPS: {{ minRational }}</li>
              <li>Max FPS: {{ maxRational }}</li>
            </ul>
          </div>
        </div>
      </tabs>
    </div>
  </div>
</template>

<script>
import Tabs from '../Tabs.vue';
import fr from '../../util/FrameRate';
import Property from './Property.vue';
import { SourcesService } from '../../services/sources.ts';

const FrameRateProperty = Property.extend({
  components: {
    Tabs,
  },

  data() {
    return {
      // Simple vs Rational Values
      mode: 'simple',

      tabs: [
        {
          name: 'Simple FPS Values',
          value: 'simple',
        },
        {
          name: 'Rational FPS Values',
          value: 'rational',
        },
      ],
    };
  },

  methods: {
    setSimpleValue(event) {
      const optionIndex = parseInt(event.target.value, 10);
      const option = this.simpleOptions[optionIndex];

      SourcesService.instance.setProperty(this.property, {
        numerator: option.numerator.toString(),
        denominator: option.denominator.toString(),
      });
    },

    setRationalValue(event) {
      const numerator = this.$refs.numerator.value;
      const denominator = this.$refs.denominator.value;

      if (numerator && denominator) {
        SourcesService.instance.setProperty(this.property, {
          numerator,
          denominator,
        });
      }
    },
  },

  computed: {
    numerator() {
      return this.property.value.numerator;
    },

    denominator() {
      return this.property.value.denominator;
    },

    framesPerSecond() {
      return fr.rationalToFramesPerSecond(this.property.value);
    },

    frameInterval() {
      return fr.rationalToFrameInterval(this.property.value);
    },

    frameIntervalMilliseconds() {
      return '' + (this.frameInterval * 1000).toFixed(2) + 'ms';
    },

    minRational() {
      if (this.property.value.ranges[0]) {
        const min = this.property.value.ranges[0].min;

        return '' + min.numerator + '/' + min.denominator;
      }
    },

    maxRational() {
      if (this.property.value.ranges[0]) {
        const max = this.property.value.ranges[0].max;

        return '' + max.numerator + '/' + max.denominator;
      }
    },

    simpleOptions() {
      // This is the default option
      let options = [
        {
          name: '',
          numerator: 0,
          denominator: 0,
        },
      ];

      if (this.property.value.ranges[0]) {
        options = options.concat(fr.simpleFPSValuesForRanges(this.property.value.ranges));
      }

      return options;
    },

    selectedSimpleOptionIndex() {
      // 0 is the default option
      let index = 0;
      const currentInterval = fr.rationalToFrameInterval(this.property.value);

      _.each(this.simpleOptions, (option, i) => {
        const interval = fr.rationalToFrameInterval(option);

        // TODO: Do a better floating point comparison with EPSILON
        if (interval === currentInterval) {
          index = i;
        }
      });

      return index;
    },
  },
});

FrameRateProperty.obsType = 'OBS_PROPERTY_FRAME_RATE';

export default FrameRateProperty;
</script>

<style lang="less" scoped>
.FrameRate-container__disabled {
  pointer-events: none;
  opacity: 0.3;
}

.FrameRate-simple {
  padding: 10px;
}

.FrameRate-rational {
  padding: 10px 0;
}

.FrameRate-rationalStats {
  margin: 20px 0;
  list-style-type: none;
}
</style>
