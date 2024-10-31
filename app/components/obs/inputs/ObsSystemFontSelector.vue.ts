import fontManager from 'font-manager';
import _ from 'lodash';
import { EFontStyle } from 'obs-studio-node';
import { Multiselect } from 'vue-multiselect';
import { Component, Prop, Watch } from 'vue-property-decorator';
import ObsFontSizeSelector from './ObsFontSizeSelector.vue';
import { IObsFont, IObsInput, ObsInput } from './ObsInput';

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

interface IFontSelect extends HTMLElement {
  value: IFontDescriptor;
}

@Component({
  components: { Multiselect, FontSizeSelector: ObsFontSizeSelector },
})
export default class ObsSystemFontSelector extends ObsInput<IObsInput<IObsFont>> {
  @Prop()
  value: IObsInput<IObsFont>;
  testingAnchor = `Form/SystemFont/${this.value.name}`;

  fonts: IFontDescriptor[] = fontManager.getAvailableFontsSync();

  $refs: {
    family: HTMLInputElement;
    font: IFontSelect;
    size: HTMLInputElement;
  };

  // CSS styles for a particular font
  styleForFont(font: IFontDescriptor) {
    let fontStyle = 'normal';

    if (font.italic) {
      fontStyle = 'italic';
    }

    return {
      fontFamily: font.family,
      fontWeight: font.weight,
      fontStyle,
    };
  }

  // Converts a list of fonts in the same family to
  // a family object.
  fontsToFamily(fonts: IFontDescriptor[]) {
    if (fonts) {
      return {
        family: fonts[0].family,
        fonts,
      };
    }

    return { family: '', fonts: [] };
  }

  setFamily(family: { family: string; fonts: IFontDescriptor[] }) {
    // When a new family is selected, we have to select a
    // default style.  This will be "Regular" if it exists.
    // Otherwise, it will be the first family on the list.

    let selected_font: IFontDescriptor;

    const regular = _.find(family.fonts, font => {
      return font.style === 'Regular';
    });

    if (regular) {
      selected_font = regular;
    } else {
      selected_font = family.fonts[0];
    }

    this.setFont({
      face: family.family,
      flags: this.getFlagsFromFont(selected_font),
    });
  }

  getFlagsFromFont(font: IFontDescriptor) {
    const flags =
      (font.italic ? EFontStyle.Italic : 0) |
      (font.oblique ? EFontStyle.Italic : 0) |
      (font.weight > 400 ? EFontStyle.Bold : 0);

    return flags;
  }

  setStyle(font: IFontDescriptor) {
    this.setFont({ flags: this.getFlagsFromFont(font) });
  }

  setSize(size: string) {
    this.setFont({ size: Number(size) });
  }

  // Generic function for setting the current font.
  // Values that are left blank will be filled with
  // the currently selected value.
  setFont(args: IObsFont) {
    const fontObj = { ...args };

    // If we want to properly apply a system font, path must be null
    fontObj.path = '';

    // Apply current values for parameters that were not passed
    if (fontObj.face === void 0) fontObj.face = this.$refs.font.value.family;
    if (fontObj.size === void 0) fontObj.size = this.value.value.size;
    if (fontObj.flags === void 0) fontObj.flags = this.getFlagsFromFont(this.$refs.font.value);

    this.emitInput({ ...this.value, value: fontObj });
  }

  restyleSelects() {
    this.restyleSelect(this.$refs.family);
    this.restyleSelect(this.$refs.font);
  }

  // This is a hack to make the vue-multiselect components
  // show the currently selected value in the appropriate font
  restyleSelect(select: any) {
    if (!this.selectedFont) return;

    const input = select.$refs.search;
    input.style['font-family'] = this.selectedFont.family;

    if (this.selectedFont.italic) {
      input.style['font-style'] = 'italic';
    } else {
      input.style['font-style'] = 'normal';
    }

    input.style['font-weight'] = this.selectedFont.weight;
  }

  mounted() {
    this.restyleSelects();
  }

  @Watch('selectedFont')
  selectedFontChangeHandler() {
    this.restyleSelects();
  }

  get selectedFamily() {
    return this.fontsToFamily(this.fontsByFamily[this.value.value.face]);
  }

  get selectedFont() {
    return _.find(this.selectedFamily.fonts, font => {
      if (this.value.value.flags !== this.getFlagsFromFont(font)) {
        return false;
      }

      return true;
    });
  }

  get fontsByFamily() {
    return _.groupBy(this.fonts, 'family');
  }

  get fontFamilies() {
    return _.sortBy(
      _.map(this.fontsByFamily, fonts => {
        return this.fontsToFamily(fonts);
      }),
      'family',
    );
  }
}
