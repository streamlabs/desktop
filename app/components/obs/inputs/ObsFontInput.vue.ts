import { Component, Prop } from 'vue-property-decorator';
import { ObsInput, IObsInput, TObsType, IObsFont, IGoogleFont } from './ObsInput';
import GoogleFontSelector from './ObsGoogleFontSelector.vue';
import ObsSystemFontSelector from './ObsSystemFontSelector.vue';

@Component({
  components: { GoogleFontSelector, SystemFontSelector: ObsSystemFontSelector },
})
class ObsFontInput extends ObsInput<IObsInput<IObsFont>> {
  static obsType: TObsType;

  @Prop()
  value: IObsInput<IObsFont>;
  testingAnchor = `Form/Font/${this.value.name}`;

  isGoogleFont = !!this.value.value.path;

  setFont(font: IObsInput<IObsFont>) {
    this.emitInput(font);
  }

  setGoogleFont(font: IGoogleFont) {
    this.emitInput({
      ...this.value,
      value: {
        path: font.path,
        face: font.face,
        flags: font.flags,
        size: Number(font.size),
      },
    });
  }

  get googleFont() {
    return {
      path: this.value.value.path,
      face: this.value.value.face,
      flags: this.value.value.flags,
      size: this.value.value.size,
    };
  }

  setFontType(e: Event) {
    this.isGoogleFont = (e.target as HTMLInputElement)['checked'];
  }
}

ObsFontInput.obsType = 'OBS_PROPERTY_FONT';

export default ObsFontInput;
