import { Component, Prop } from 'vue-property-decorator';
import { IObsFont, IObsInput, ObsInput } from './ObsInput';
import { ListInput } from 'components/shared/inputs/inputs';
import ObsFontSizeSelector from './ObsFontSizeSelector.vue';
import HFormGroup from 'components/shared/inputs/HFormGroup.vue';
import fontManager from 'font-manager';
import { EFontStyle } from 'obs-studio-node';

/**
 * @tutorial https://github.com/devongovett/font-manager
 */
interface IFontDescriptor {
  path: string;
  postscriptName: string;
  family: string;
  style: string;
  weight: number;
  width: number;
  italic: boolean;
  oblique: boolean;
  monospace: boolean;
}

@Component({
  components: { ListInput, FontSizeSelector: ObsFontSizeSelector, HFormGroup },
})
export default class ObsSystemFontSelector extends ObsInput<IObsInput<IObsFont>> {
  @Prop()
  value: IObsInput<IObsFont>;

  fonts: IFontDescriptor[] = [];

  mounted() {
    fontManager.getAvailableFonts((fonts: IFontDescriptor[]) => (this.fonts = fonts));
  }

  setFamily(family: string) {
    // Select a default style for the family, preferably "Regular"
    const regular = this.fonts.find(font => font.style === 'Regular' && font.family === family);
    const fontForStyle = regular || this.fonts.find(font => font.family === family);

    this.setFont({
      face: family,
      flags: this.getFlagsFromFont(fontForStyle),
      style: fontForStyle.style,
    });
  }

  getFlagsFromFont(font: IFontDescriptor) {
    return (
      (font.italic ? EFontStyle.Italic : 0) |
      (font.oblique ? EFontStyle.Italic : 0) |
      (font.weight > 400 ? EFontStyle.Bold : 0)
    );
  }

  setStyle(style: string) {
    // Set a default style if not set, otherwise `selectedFont` can't be found below
    if (!this.value.value.style) {
      this.value.value.style = 'Regular';
    }

    const font = this.fonts.find(f => f.style === style && f.family === this.selectedFont.family);
    this.setFont({ flags: this.getFlagsFromFont(font), style: font.style });
  }

  setSize(size: string) {
    this.setFont({ size: Number(size) });
  }

  setFont(args: IObsFont) {
    // Stops slider component from eagerly setting value on component load
    if (args.size === this.value.value.size) return;

    // Path has to not exist for system fonts to properly toggle with Google fonts
    const fontObj = { ...this.value.value, ...args, path: '' };
    this.emitInput({ ...this.value, value: fontObj });
  }

  get selectedFont() {
    const { face, style } = this.value.value;
    return this.fonts.find(font => face === font.family && style === font.style);
  }

  get stylesForFamily() {
    return this.fonts
      .filter(font => font.family === this.value.value.face)
      .map(font => ({ value: font.style, title: font.style }));
  }

  get fontFamilies() {
    return this.fonts
      .filter((font, idx, self) => self.findIndex(f => f.family === font.family) === idx)
      .map(font => ({ value: font.family, title: font.family }));
  }

  get familyMetadata() {
    return {
      name: 'font_face',
      options: this.fontFamilies,
      allowEmpty: false,
      disabled: this.value.enabled === false || this.fonts.length === 0,
    };
  }

  familyOptionStyle(val: string) {
    return { fontFamily: val };
  }

  styleOptionStyle(val: string) {
    if (!this.selectedFont) return;
    const fontStyle = this.fonts.find(
      font => font.family === this.selectedFont.family && font.style === val,
    );
    if (!fontStyle) return;
    return {
      fontFamily: this.selectedFont.family,
      fontStyle: fontStyle.italic ? 'italic' : 'regular',
      fontWeight: fontStyle.weight,
    };
  }

  get styleMetadata() {
    return {
      name: 'font_style',
      options: this.stylesForFamily,
      allowEmpty: false,
      disabled: this.value.enabled === false || this.fonts.length === 0,
    };
  }
}
