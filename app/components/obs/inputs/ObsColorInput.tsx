import { Component, Prop } from 'vue-property-decorator';
import { debounce, throttleSetter } from 'lodash-decorators';
import { TObsType, IObsInput, ObsInput } from './ObsInput';
import Utils from '../../../services/utils';
import HFormGroup from 'components/shared/inputs/HFormGroup.vue';
import { metadata } from 'components/shared/inputs';

interface IColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

@Component({})
class ObsColorInput extends ObsInput<IObsInput<number>> {
  static obsType: TObsType;

  @Prop()
  value: IObsInput<number>;

  @debounce(500)
  setValue(hex: string) {
    const rgba = this.hexToRGB(hex);
    if (!Object.keys(rgba).every(key => rgba[key] === this.obsColor[key])) {
      const intColor = Utils.rgbaToInt(rgba.r, rgba.g, rgba.b, rgba.a);
      this.emitInput({ ...this.value, value: intColor });
    }
  }

  mounted() {
    this.setValue(this.hexColor);
  }

  get hexColor() {
    const rgba = Utils.intToRgba(this.value.value);
    return `#${
      this.intTo2hexDigit(rgba.r) +
      this.intTo2hexDigit(rgba.g) +
      this.intTo2hexDigit(rgba.b) +
      this.intTo2hexDigit(rgba.a)
    }`;
  }

  get obsColor(): IColor {
    const rgba = Utils.intToRgba(this.value.value);
    return {
      r: rgba.r,
      g: rgba.g,
      b: rgba.b,
      a: rgba.a,
    };
  }

  private intTo2hexDigit(int: number) {
    let result = int.toString(16);
    if (result.length === 1) result = `0${result}`;
    return result;
  }

  hexToRGB(hex: string) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    let a = 255;

    if (hex[8]) {
      a = parseInt(hex.slice(7, 9), 16);
    }

    return { r, g, b, a };
  }

  get metadata() {
    return metadata.color({ title: this.value.description, fullWidth: true, includeAlpha: true });
  }

  render() {
    return (
      <HFormGroup
        value={this.hexColor}
        onInput={(hex: string) => this.setValue(hex)}
        metadata={this.metadata}
      />
    );
  }
}

ObsColorInput.obsType = 'OBS_PROPERTY_COLOR';

export default ObsColorInput;
