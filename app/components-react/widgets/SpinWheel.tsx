import React from 'react';
import { Button, Menu } from 'antd';
import { $t } from 'services/i18n';
import { IWidgetCommonState, useWidget, WidgetModule } from './common/useWidget';
import { WidgetLayout } from './common/WidgetLayout';
import FormFactory from 'components-react/shared/inputs/FormFactory';
import Form from 'components-react/shared/inputs/Form';
import { IBaseMetadata, metadata } from '../shared/inputs/metadata';
import { ColorInput, TextInput, SliderInput, ListInput } from '../shared/inputs';
import { IListOption } from '../shared/inputs/ListInput';
import merge from 'lodash/merge';
import omit from 'lodash/omit';
import uuid from 'uuid/v4';
import cx from 'classnames';
import styles from './SpinWheel.m.less';

interface ISpinWheelCategory {
  color: string;
  prize: string;
  key: string;
}

interface ISpinWheelSection {
  category: number;
  weight: number;
  key: string;
}

interface ISpinWheelState extends IWidgetCommonState {
  data: {
    settings: {
      result_color: string;
      result_template: string;
      hide_timeout: number;
      rotation_speed: number;
      slow_rate: number;
      font: string;
      font_color: string;
      font_size: number;
      font_weight: number;
      label_height: number;
      label_width: number;
      border_color: string;
      inner_border_width: number;
      outer_border_width: number;
      ticker_url: string;
      ticker_size: number;
      ticker_tone: string;
      center_enabled: boolean;
      center_default: string;
      center_url: string;
      center_size: number;
      center_border_enabled: boolean;
      center_border_color: string;
      center_border_width: number;
      // Non-standard state format used to simplify category/section management in the editor.
      // These will be handled separately in the form factory.
      categories: ISpinWheelCategory[];
      sections: ISpinWheelSection[];
    };
  };
}

type TSpinWheelSettings = ISpinWheelState['data']['settings'];
type TSpinWheelSetting = keyof TSpinWheelSettings;
type TSpinWheelMeta = PartialRec<TSpinWheelSetting | `_${string}`, IBaseMetadata>;

function fromMeta(meta: TSpinWheelMeta): Dictionary<IBaseMetadata> {
  return meta as Dictionary<IBaseMetadata>;
}

function fromWheelJSON<T extends { key: string }>(data: string): T[] {
  return JSON.parse(data).map((v: Omit<T, 'key'>) => ({ key: uuid(), ...v }));
}

export function SpinWheel() {
  const {
    settings,
    wheelMeta,
    fontMeta,
    borderMeta,
    tickerMeta,
    imageMeta,
    hasLoadedSettings,
    updateSetting,
    setSelectedTab,
    selectedTab,
    addCategory,
    removeCategory,
    editCategory,
    clearCategories,
    addSection,
    removeSection,
    editSection,
    moveSection,
    clearSections,
    sectionOptions,
  } = useSpinWheel();

  // These values are used in the meta to build the category/section lists. Do not use it in the factory.
  const mutableSettings = settings as Omit<typeof settings, 'categories' | 'sections'>;

  return (
    <WidgetLayout>
      <Menu onClick={e => setSelectedTab(e.key)} selectedKeys={[selectedTab]}>
        <Menu.Item key="wheel">{$t('Manage Spin Wheel')}</Menu.Item>
        <Menu.Item key="categories">{$t('Categories')}</Menu.Item>
        <Menu.Item key="sections">{$t('Section Weights')}</Menu.Item>
        <Menu.Item key="font">{$t('Font Settings')}</Menu.Item>
        <Menu.Item key="border">{$t('Border')}</Menu.Item>
        <Menu.Item key="ticker">{$t('Ticker')}</Menu.Item>
        <Menu.Item key="image">{$t('Center Image')}</Menu.Item>
      </Menu>
      <Form>
        {hasLoadedSettings(settings) && selectedTab === 'wheel' && (
          <FormFactory metadata={wheelMeta} values={mutableSettings} onChange={updateSetting} />
        )}
        {hasLoadedSettings(settings) && selectedTab === 'categories' && (
          <CategoryEditor
            categories={settings.categories}
            onAdd={addCategory}
            onClear={clearCategories}
            onEdit={editCategory}
            onRemove={removeCategory}
          />
        )}
        {hasLoadedSettings(settings) && selectedTab === 'sections' && (
          <SectionEditor
            sections={settings.sections}
            sectionOptions={sectionOptions}
            addSectionDisabled={settings.categories.length === 0}
            onAdd={addSection}
            onClear={clearSections}
            onEdit={editSection}
            onRemove={removeSection}
            onMove={moveSection}
          />
        )}
        {hasLoadedSettings(settings) && selectedTab === 'font' && (
          <FormFactory metadata={fontMeta} values={mutableSettings} onChange={updateSetting} />
        )}
        {hasLoadedSettings(settings) && selectedTab === 'border' && (
          <FormFactory metadata={borderMeta} values={mutableSettings} onChange={updateSetting} />
        )}
        {hasLoadedSettings(settings) && selectedTab === 'ticker' && (
          <FormFactory metadata={tickerMeta} values={mutableSettings} onChange={updateSetting} />
        )}
        {hasLoadedSettings(settings) && selectedTab === 'image' && (
          <FormFactory metadata={imageMeta} values={mutableSettings} onChange={updateSetting} />
        )}
      </Form>
    </WidgetLayout>
  );
}

function CategoryEditor(p: {
  categories: ISpinWheelCategory[];
  onAdd: () => void;
  onClear: () => void;
  onEdit: (key: string, patch: Partial<Omit<ISpinWheelCategory, 'key'>>) => void;
  onRemove: (key: string) => void;
}) {
  return (
    <div>
      {p.categories.map(category => (
        <div key={category.key} className={cx('ant-form-inline', styles.categoryEditorRow)}>
          <div className={styles.categoryEditorRowName}>
            <TextInput
              nowrap
              value={category.prize}
              onChange={(val: string) => p.onEdit(category.key, { prize: val })}
            />
          </div>
          <div>
            <ColorInput
              nowrap
              value={category.color}
              onChange={(val: string) => p.onEdit(category.key, { color: val })}
            />
          </div>
          <i
            className={cx('icon-close', styles.categoryEditorRowCloseButton)}
            onClick={() => p.onRemove(category.key)}
          />
        </div>
      ))}
      <div className={styles.categoryEditorButtons}>
        <Button type="primary" onClick={p.onAdd}>
          {$t('Add Category')}
        </Button>
        <Button onClick={p.onClear}>{$t('Clear All')}</Button>
      </div>
    </div>
  );
}

function SectionEditor(p: {
  sections: ISpinWheelSection[];
  sectionOptions: IListOption<number>[];
  addSectionDisabled: boolean;
  onAdd: () => void;
  onClear: () => void;
  onEdit: (key: string, patch: Partial<Omit<ISpinWheelSection, 'key'>>) => void;
  onRemove: (key: string) => void;
  onMove: (key: string, idxMod: number) => void;
}) {
  return (
    <div>
      {p.sections.map((section, i) => (
        <div key={section.key} className={cx('ant-form-inline', styles.sectionEditorRow)}>
          <div className={styles.sectionEditorRowCategory}>
            <ListInput
              nowrap
              value={section.category}
              onChange={(val: number) => p.onEdit(section.key, { category: val })}
              options={p.sectionOptions}
            />
          </div>
          <div className={styles.sectionEditorRowWeight}>
            <SliderInput
              nowrap
              value={section.weight}
              onChange={(val: number) => p.onEdit(section.key, { weight: val })}
              min={1}
              max={20}
            />
          </div>
          <div className={styles.sectionEditorRowButtons}>
            <i
              className={cx('icon-close', styles.sectionEditorRowCloseButton)}
              onClick={() => p.onRemove(section.key)}
            />
            {i !== 0 && (
              <i
                className={cx('fa', 'fa-chevron-up', styles.sectionEditorRowCloseButton)}
                onClick={() => p.onMove(section.key, -1)}
              />
            )}
            {i < p.sections.length - 1 && (
              <i
                className={cx('fa', 'fa-chevron-down', styles.sectionEditorRowCloseButton)}
                onClick={() => p.onMove(section.key, 1)}
              />
            )}
          </div>
        </div>
      ))}
      {p.addSectionDisabled && (
        <div className={styles.sectionEditorWarning}>
          {$t('Add categories before adding new sections.')}
        </div>
      )}
      <div className={styles.sectionEditorButtons}>
        <Button type="primary" disabled={p.addSectionDisabled} onClick={p.onAdd}>
          {$t('Add Section')}
        </Button>
        <Button onClick={p.onClear}>{$t('Clear All')}</Button>
      </div>
    </div>
  );
}

export class SpinWheelModule extends WidgetModule<ISpinWheelState> {
  get wheelMeta() {
    return fromMeta({
      result_template: metadata.textarea({ label: $t('Results Template') }),
      result_color: metadata.color({ label: $t('Results Color') }),
      hide_timeout: metadata.slider({ label: $t('Hide Timeout'), min: 0, max: 15 }),
      rotation_speed: metadata.slider({ label: $t('Rotation Speed'), min: 1, max: 50 }),
      slow_rate: metadata.slider({ label: $t('Slowdown Rate'), min: 1, max: 10 }),
    });
  }

  get fontMeta() {
    return fromMeta({
      font: metadata.fontFamily({ label: $t('Font') }),
      font_color: metadata.color({ label: $t('Font Color') }),
      font_size: metadata.fontSize({ label: $t('Font Size') }),
      font_weight: metadata.slider({ label: $t('Font Weight'), min: 300, max: 900, step: 100 }),
      label_height: metadata.slider({ label: $t('Label Height'), min: 1, max: 30 }),
      label_width: metadata.slider({ label: $t('Label Width'), min: 0, max: 10 }),
    });
  }

  get borderMeta() {
    return fromMeta({
      border_color: metadata.color({ label: $t('Border Color') }),
      inner_border_width: metadata.slider({ label: $t('Inner Border Width'), min: 0, max: 10 }),
      outer_border_width: metadata.slider({ label: $t('Outer Border Width'), min: 0, max: 20 }),
    });
  }

  get tickerMeta() {
    return fromMeta({
      ticker_url: metadata.any({ type: 'mediaurl', label: $t('Ticker Image') }),
      ticker_size: metadata.slider({ label: $t('Ticker Size'), min: 1, max: 10 }),
      ticker_tone: metadata.any({ type: 'audiourl', label: $t('Ticker Tone') }),
    });
  }

  get imageMeta() {
    return fromMeta({
      center_enabled: metadata.bool({ label: $t('Center Image Enabled') }),
      center_url: metadata.any({ type: 'mediaurl', label: $t('Center Image') }),
      center_size: metadata.slider({ label: $t('Center Image Size'), min: 1, max: 10 }),
      center_border_enabled: metadata.bool({ label: $t('Center Image Border Enabled') }),
      center_border_color: metadata.color({ label: $t('Center Image Border Color') }),
      center_border_width: metadata.slider({
        label: $t('Center Image Border Width'),
        min: 1,
        max: 15,
      }),
    });
  }

  get categories(): ISpinWheelCategory[] {
    return this.settings?.categories ?? [];
  }

  get sections(): ISpinWheelSection[] {
    return this.settings?.sections ?? [];
  }

  get sectionOptions(): IListOption<number>[] {
    return this.categories.map((cat, i) => ({ label: cat.prize, value: i }));
  }

  addCategory() {
    this.replaceSettings({
      categories: [...this.categories, { color: '#ffffff', prize: 'Donut', key: uuid() }],
    });
  }

  clearCategories() {
    this.replaceSettings({ categories: [], sections: [] });
  }

  editCategory(key: string, patch: Partial<Omit<ISpinWheelCategory, 'key'>>) {
    this.replaceSettings({
      categories: this.categories.map(cat => (cat.key === key ? { ...cat, ...patch } : cat)),
    });
  }

  removeCategory(key: string) {
    const catIdx = this.categories.findIndex(cat => cat.key === key);
    const newCategories = this.categories.filter(cat => cat.key !== key);
    const newSections = this.sections
      .filter(sect => sect.category !== catIdx)
      .map(sect => ({
        ...sect,
        category: sect.category > catIdx ? sect.category - 1 : sect.category,
      }));
    this.replaceSettings({ categories: newCategories, sections: newSections });
  }

  addSection() {
    this.replaceSettings({
      sections: [...this.sections, { category: 0, weight: 1, key: uuid() }],
    });
  }

  clearSections() {
    this.replaceSettings({ sections: [] });
  }

  editSection(key: string, patch: Partial<Omit<ISpinWheelSection, 'key'>>) {
    this.replaceSettings({
      sections: this.sections.map(sect => (sect.key === key ? { ...sect, ...patch } : sect)),
    });
  }

  removeSection(key: string) {
    this.replaceSettings({
      sections: this.sections.filter(sect => sect.key !== key),
    });
  }

  moveSection(key: string, idxMod: number) {
    const sections = [...this.sections];
    const idx = sections.findIndex(sect => sect.key === key);
    if (idxMod > 0) {
      sections.splice(idx, 2, sections[idx + idxMod], sections[idx]);
    } else {
      sections.splice(idx + idxMod, 2, sections[idx], sections[idx + idxMod]);
    }
    this.replaceSettings({ sections });
  }

  protected patchAfterFetch(data: any): ISpinWheelState['data'] {
    const localSettings: TSpinWheelSettings = {
      result_color: data.settings.resultColor,
      result_template: data.settings.resultTemplate,
      hide_timeout: data.settings.hideTimeout,
      rotation_speed: data.settings.rotationSpeed,
      slow_rate: data.settings.slowRate,
      font: data.settings.font,
      font_color: data.settings.fontColor,
      font_size: data.settings.fontSize,
      font_weight: data.settings.fontWeight,
      label_height: data.settings.labelText.height,
      label_width: data.settings.labelText.width,
      border_color: data.settings.borderColor,
      inner_border_width: data.settings.innerBorderWidth,
      outer_border_width: data.settings.outerBorderWidth,
      ticker_url: data.settings.ticker.url,
      ticker_size: data.settings.ticker.size,
      ticker_tone: data.settings.ticker.tone,
      center_enabled: data.settings.centerImage.enabled,
      center_default: data.settings.centerImage.default,
      center_size: data.settings.centerImage.size,
      center_url: data.settings.centerImage.url,
      center_border_enabled: data.settings.centerImage.border.enabled,
      center_border_color: data.settings.centerImage.border.color,
      center_border_width: data.settings.centerImage.border.width,
      categories: fromWheelJSON(data.settings.categories),
      sections: fromWheelJSON(data.settings.sections),
    };

    return merge({}, data, { settings: localSettings });
  }

  protected patchBeforeSend(local: TSpinWheelSettings): any {
    return merge(
      omit(local, [
        'result_color',
        'result_template',
        'hide_timeout',
        'rotation_speed',
        'slow_rate',
        'font_color',
        'font_size',
        'font_weight',
        'label_height',
        'label_width',
        'border_color',
        'inner_border_width',
        'outer_border_width',
        'ticker_url',
        'ticker_size',
        'ticker_tone',
        'center_enabled',
        'center_default',
        'center_url',
        'center_size',
        'center_border_enabled',
        'center_border_color',
        'center_border_width',
      ] as (keyof TSpinWheelSettings)[]),
      {
        resultColor: local.result_color,
        resultTemplate: local.result_template,
        hideTimeout: local.hide_timeout,
        rotationSpeed: local.rotation_speed,
        slowRate: local.slow_rate,
        font: local.font,
        fontColor: local.font_color,
        fontSize: local.font_size,
        fontWeight: local.font_weight,
        labelText: { height: local.label_height, width: local.label_width },
        borderColor: local.border_color,
        innerBorderWidth: local.inner_border_width,
        outerBorderWidth: local.outer_border_width,
        ticker: { url: local.ticker_url, size: local.ticker_size, tone: local.ticker_tone },
        centerImage: {
          enabled: local.center_enabled,
          default: local.center_default,
          url: local.center_url,
          size: local.center_size,
          border: {
            enabled: local.center_border_enabled,
            color: local.center_border_color,
            width: local.center_border_width,
          },
        },
      },
    );
  }
}

function useSpinWheel() {
  return useWidget<SpinWheelModule>();
}
