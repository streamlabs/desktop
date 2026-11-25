import React, { useEffect, useMemo, useState } from 'react';
import fontManager from 'font-manager';
import * as fi from 'node-fontinfo';
import { EFontStyle } from 'obs-studio-node';
import { IObsFont } from 'services/sources/obs-properties';
import { $t } from 'services/i18n';
import { ListInput, SliderInput, SwitchInput } from '../shared/inputs';
import { IListOption } from '../shared/inputs/ListInput';
import { getResource } from 'services/core/injector';
import { FontLibraryService } from 'services/font-library';

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

interface IProps {
  value: IObsFont;
  disabled?: boolean;
  onChange: (value: IObsFont) => unknown;
}

/**
 * Font input (OBS_PROPERTY_FONT). Emits an `IObsFont`. A non-empty `path` means a Google font.
 */
export function ObsFontInput(p: IProps) {
  const [isGoogleFont, setIsGoogleFont] = useState(!!p.value?.path);

  return (
    <div>
      <SwitchInput
        label={$t('Use Google Font')}
        value={isGoogleFont}
        onChange={setIsGoogleFont}
        disabled={p.disabled}
      />
      {isGoogleFont ? <GoogleFontSelector {...p} /> : <SystemFontSelector {...p} />}
    </div>
  );
}

// The value '256' was added for compatibility with the OBS,
// as it has '256' as the default value for a text with version greater than 1.
const FONT_SIZE_PRESETS = [9, 10, 11, 12, 13, 14, 18, 24, 36, 48, 64, 72, 96, 144, 256, 288];
const FONT_SIZE_MARKS = Object.fromEntries(FONT_SIZE_PRESETS.map(size => [size, String(size)]));

function FontSizeSelector(p: {
  value?: number;
  disabled?: boolean;
  onChange: (v: number) => unknown;
}) {
  // snaps to the presets only (step=null), like the legacy piecewise slider
  return (
    <SliderInput
      name="font_size"
      label={$t('Font Size')}
      value={p.value}
      min={9}
      max={288}
      marks={FONT_SIZE_MARKS}
      step={null}
      debounce={500}
      disabled={p.disabled}
      onChange={p.onChange}
    />
  );
}

function getFlagsFromFont(font: IFontDescriptor) {
  return (
    (font.italic ? EFontStyle.Italic : 0) |
    (font.oblique ? EFontStyle.Italic : 0) |
    (font.weight > 400 ? EFontStyle.Bold : 0)
  );
}

function SystemFontSelector(p: IProps) {
  const [fonts, setFonts] = useState<IFontDescriptor[]>([]);

  useEffect(() => {
    let mounted = true;
    fontManager.getAvailableFonts((f: IFontDescriptor[]) => mounted && setFonts(f));
    return () => {
      mounted = false;
    };
  }, []);

  const value: IObsFont = p.value || {};

  const families: IListOption<string>[] = useMemo(
    () =>
      fonts
        .filter((font, idx, self) => self.findIndex(f => f.family === font.family) === idx)
        .map(font => ({ value: font.family, label: font.family })),
    [fonts],
  );

  const styles: IListOption<string>[] = useMemo(
    () =>
      fonts
        .filter(font => font.family === value.face)
        .map(f => ({ value: f.style, label: f.style })),
    [fonts, value.face],
  );

  function setFont(args: IObsFont) {
    // Stops slider component from eagerly setting value on component load
    if (args.size !== undefined && args.size === value.size) return;

    // Path has to not exist for system fonts to properly toggle with Google fonts
    p.onChange({ ...value, ...args, path: '' });
  }

  function setFamily(family: string) {
    // Select a default style for the family, preferably "Regular"
    const regular = fonts.find(font => font.style === 'Regular' && font.family === family);
    const fontForStyle = regular || fonts.find(font => font.family === family);
    if (!fontForStyle) return;

    setFont({ face: family, flags: getFlagsFromFont(fontForStyle), style: fontForStyle.style });
  }

  function setStyle(style: string) {
    const font = fonts.find(f => f.style === style && f.family === value.face);
    if (!font) return;
    setFont({ flags: getFlagsFromFont(font), style: font.style });
  }

  const disabled = p.disabled || fonts.length === 0;

  return (
    <>
      <ListInput
        name="font_face"
        label={$t('Font Family')}
        value={value.face}
        options={families}
        allowClear={false}
        disabled={disabled}
        onChange={setFamily}
        optionRender={opt => <span style={{ fontFamily: opt.value }}>{opt.label}</span>}
      />
      <ListInput
        name="font_style"
        label={$t('Font Style')}
        value={value.style}
        options={styles}
        allowClear={false}
        disabled={disabled}
        onChange={setStyle}
        optionRender={opt => {
          const fontStyle = fonts.find(f => f.family === value.face && f.style === opt.value);
          if (!fontStyle) return opt.label;
          return (
            <span
              style={{
                fontFamily: fontStyle.family,
                fontStyle: fontStyle.italic ? 'italic' : 'normal',
                fontWeight: fontStyle.weight,
              }}
            >
              {opt.label}
            </span>
          );
        }}
      />
      <FontSizeSelector
        value={value.size}
        disabled={p.disabled}
        onChange={size => setFont({ size: Number(size) })}
      />
    </>
  );
}

function GoogleFontSelector(p: IProps) {
  // FontLibraryService isn't part of the `AppServices` map, resolve it by name
  const fontLibrary = getResource<FontLibraryService>('FontLibraryService');
  const value: IObsFont = p.value || {};

  const [families, setFamilies] = useState<IListOption<string>[]>([]);
  const [styles, setStyles] = useState<IListOption<string>[]>([]);
  const [selectedFamily, setSelectedFamily] = useState('');
  const [selectedStyle, setSelectedStyle] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  async function updateStyles(family: string) {
    if (!family) return;
    const fam = await fontLibrary.findFamily(family);
    setStyles(fam.styles.map(sty => ({ label: sty.name, value: sty.name })));
  }

  async function updateSelectionFromPath(path: string) {
    const info = await fontLibrary.lookupFontInfo(path);
    setSelectedFamily(info.family);
    setSelectedStyle(info.style);
    await updateStyles(info.family);
  }

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    fontLibrary.getManifest().then(manifest => {
      if (!mounted) return;
      setIsLoading(false);
      setFamilies(manifest.families.map(family => ({ label: family.name, value: family.name })));
      if (value.path) updateSelectionFromPath(value.path);
    });
    return () => {
      mounted = false;
    };
  }, []);

  async function setStyle(styleName: string, family: string) {
    setIsLoading(true);
    setSelectedStyle(styleName);

    try {
      const style = await fontLibrary.findStyle(family, styleName);
      const fontPath = await fontLibrary.downloadFont(style.file);
      const fontInfo = fi.getFontInfo(fontPath);

      /* GDI+ (and so the OBS plugin) only understands Bold | Italic | Bold Italic | Regular
       * styles, anything else must be part of the family name, so use the actual family name
       * from the font file. If the info can't be read, fall back to Arial. */
      const face = fontInfo ? fontInfo.family_name : 'Arial';
      const flags = fontInfo
        ? (fontInfo.italic ? EFontStyle.Italic : 0) | (fontInfo.bold ? EFontStyle.Bold : 0)
        : 0;

      p.onChange({ ...value, face, flags, path: fontPath });
      setIsLoading(false);
    } catch (error: unknown) {
      console.warn('Could not download the selected font', error);
      setIsLoading(false);
      if (value.path) {
        updateSelectionFromPath(value.path);
      } else {
        setSelectedFamily('');
        setSelectedStyle('');
      }
    }
  }

  async function setFamily(familyName: string) {
    setIsLoading(true);
    setSelectedFamily(familyName);
    const family = await fontLibrary.findFamily(familyName);
    updateStyles(familyName);
    await setStyle(family.styles[0].name, familyName);
  }

  const disabled = p.disabled || isLoading;

  return (
    <div className="google-font-selector">
      <ListInput
        label={$t('Font Family')}
        value={selectedFamily}
        options={families}
        showSearch
        disabled={disabled}
        loading={isLoading}
        onChange={setFamily}
      />
      <ListInput
        label={$t('Font Style')}
        value={selectedStyle}
        options={styles}
        allowClear={false}
        disabled={disabled}
        loading={isLoading}
        onChange={styleName => setStyle(styleName, selectedFamily)}
      />
      <FontSizeSelector
        value={value.size}
        disabled={p.disabled}
        onChange={size => p.onChange({ ...value, size: Number(size) })}
      />
    </div>
  );
}
