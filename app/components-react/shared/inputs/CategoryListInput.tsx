import { Input, Select } from 'antd';
import { LabeledValue, RefSelectProps, SelectProps } from 'antd/lib/select';
import cx from 'classnames';
import omit from 'lodash/omit';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { $t } from '../../../services/i18n';
import { InputComponent, TSlobsInputProps, useInput, ValuesOf } from './inputs';
import InputWrapper from './InputWrapper';
import { IListOption } from './ListInput';
import styles from './CategoryListInput.m.less';

// select what features from the antd lib we are going to use
const ANT_SELECT_FEATURES = ['allowClear', 'bordered', 'dropdownMatchSelectWidth'] as const;

/**
 * One category of the dropdown. Picking it in the root view drills into its list of options.
 */
export interface ICategoryListCategory<TValue> {
  key: string;
  label: string;
  options: IListOption<TValue>[];
}

interface ICustomCategoryListProps<TValue extends string | number> {
  categories: ICategoryListCategory<TValue>[];
  /** Placeholder of the search box in the root view. Default: "Search" */
  searchPlaceholder?: string;
  /** Max height of the scrolling list in px. Default: 192 (6 rows of antd's 32px select items) */
  listHeight?: number;
  nolabel?: boolean;
  /** Receives `undefined` when the value is cleared via `allowClear`. */
  onChange?: (val: TValue | undefined) => unknown;
}

export type TCategoryListInputProps<TValue extends string | number> = TSlobsInputProps<
  ICustomCategoryListProps<TValue>,
  TValue | undefined,
  SelectProps<string>,
  ValuesOf<typeof ANT_SELECT_FEATURES>
>;

/** A row of the dropdown: a category to drill into, or an option to pick. */
type TRow<TValue> =
  | { type: 'category'; key: string; category: ICategoryListCategory<TValue> }
  | {
      type: 'option';
      key: string;
      option: IListOption<TValue>;
      /** Shown next to the option when it is listed outside of its category (root search) */
      categoryLabel?: string;
    };

/**
 * A Select whose dropdown is a drill-down list. The root view lists the categories, a search box
 * above them looks through all options at once, and picking a category shows only its options.
 * Works with or without a Form.
 */
export const CategoryListInput = InputComponent(
  <T extends string | number>(p: TCategoryListInputProps<T>) => {
    // the value is `undefined` while nothing is selected, or after it was cleared
    const { inputAttrs, wrapperAttrs } = useInput<TCategoryListInputProps<T>, T | undefined>(
      'categorylist',
      p,
      ANT_SELECT_FEATURES,
    );

    const { categories } = p;
    const listHeight = p.listHeight ?? 192;
    const value = inputAttrs.value;

    const selectRef = useRef<RefSelectProps>(null);
    const searchRef = useRef<Input>(null);
    const popupRef = useRef<HTMLDivElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    // The category being browsed, `null` in the root view
    const [activeKey, setActiveKey] = useState<string | null>(null);
    // Index of the highlighted row
    const [highlight, setHighlight] = useState(0);

    const selectedCategory = useMemo(() => {
      if (value == null) return undefined;
      return categories.find(c => c.options.some(o => o.value === value));
    }, [categories, value]);
    const selectedOption = selectedCategory?.options.find(o => o.value === value);

    // The Select has no options of its own, so the closed field can't look the label up there.
    // `labelInValue` lets us hand the Select the label of the selected option directly.
    const selectedValue: LabeledValue | undefined =
      value == null ? undefined : { value, label: selectedOption?.label ?? String(value) };

    const activeCategory =
      activeKey === null ? undefined : categories.find(c => c.key === activeKey);
    const needle = query.trim().toLowerCase();

    const rows = useMemo<TRow<T>[]>(() => {
      const matching = (category: ICategoryListCategory<T>) =>
        category.options.filter(o => !needle || o.label.toLowerCase().includes(needle));
      const optionRow = (
        category: ICategoryListCategory<T>,
        option: IListOption<T>,
        showCategory: boolean,
      ): TRow<T> => ({
        type: 'option',
        key: `${category.key}:${option.value}`,
        option,
        categoryLabel: showCategory ? category.label : undefined,
      });

      // Category view: only the options of that category
      if (activeCategory) {
        return matching(activeCategory).map(o => optionRow(activeCategory, o, false));
      }

      // Root view: the categories
      if (!needle) {
        return categories.map(
          (category): TRow<T> => ({ type: 'category', key: category.key, category }),
        );
      }

      // Root search: the matching options of all categories in one flat list
      const found: TRow<T>[] = [];
      for (const category of categories) {
        for (const option of matching(category)) found.push(optionRow(category, option, true));
      }
      return found;
    }, [categories, activeCategory, needle]);

    // `highlight` can be out of range for a moment after the rows changed
    const activeIndex = Math.min(highlight, rows.length - 1);

    // Moving focus into the search box needs a tick: the popup isn't mounted yet when the dropdown
    // opens from the keyboard. The same goes for scrolling to the highlighted row.
    useEffect(() => {
      if (!isOpen) return;
      const id = window.setTimeout(() => {
        searchRef.current?.focus();
        scrollToRow(activeIndex);
      }, 0);
      return () => window.clearTimeout(id);
    }, [isOpen, activeKey]);

    function scrollToRow(index: number) {
      const list = listRef.current;
      const row = list?.children[index] as HTMLElement | undefined;
      if (!list || !row) return;
      // `offsetTop` is relative to the list, which is positioned
      if (row.offsetTop < list.scrollTop) {
        list.scrollTop = row.offsetTop;
      } else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) {
        list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
      }
    }

    /** Switches to a category view, or to the root view with `null`. Always clears the query. */
    function showCategory(category: ICategoryListCategory<T> | null) {
      setQuery('');
      setActiveKey(category?.key ?? null);
      // Start on the current value when it is in this category, else on the first row
      setHighlight(
        category
          ? Math.max(
              0,
              category.options.findIndex(o => o.value === value),
            )
          : 0,
      );
    }

    function changeOpen(nextOpen: boolean) {
      if (nextOpen) {
        // Every open starts fresh: no query, in the category of the current value, else the root
        showCategory(selectedCategory ?? null);
      } else if (popupRef.current?.contains(document.activeElement)) {
        // The search box is about to be hidden, so hand focus back to the field.
        selectRef.current?.focus();
      }
      setIsOpen(nextOpen);
    }

    function activateRow(row: TRow<T>) {
      if (row.type === 'category') {
        showCategory(row.category);
      } else {
        inputAttrs.onChange(row.option.value);
        changeOpen(false);
      }
    }

    function moveHighlight(step: number) {
      if (!rows.length) return;
      const next = (activeIndex + step + rows.length) % rows.length;
      setHighlight(next);
      scrollToRow(next);
    }

    function onQueryChange(nextQuery: string) {
      setQuery(nextQuery);
      setHighlight(0);
      if (listRef.current) listRef.current.scrollTop = 0;
    }

    function onSelectClick(e: React.MouseEvent) {
      // Clicking the field makes the Select focus itself after the dropdown opened. Take focus
      // back for the search box. Clicks inside the popup bubble here too, so skip those.
      if (isOpen && !popupRef.current?.contains(e.target as Node)) {
        searchRef.current?.focus();
      }
    }

    function onPopupMouseDown(e: React.MouseEvent) {
      // Keep the focus in the search box when pressing a row, the back link or the padding,
      // otherwise the Select would see the blur and close the dropdown.
      if (e.target !== searchRef.current?.input) e.preventDefault();
    }

    function onSearchKeyDown(e: React.KeyboardEvent) {
      // React events from the portal bubble up to the Select, which would act on them itself
      e.stopPropagation();
      if (e.nativeEvent.isComposing) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          moveHighlight(1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          moveHighlight(-1);
          break;
        case 'Enter':
          e.preventDefault();
          if (rows[activeIndex]) activateRow(rows[activeIndex]);
          break;
        case 'Escape':
          e.preventDefault();
          changeOpen(false);
          break;
        case 'Backspace':
          // On an empty search box there is nothing to delete, so go back instead
          if (activeCategory && !query) {
            e.preventDefault();
            showCategory(null);
          }
          break;
      }
    }

    function getPopupContainer(triggerNode: HTMLElement) {
      // stick the selector popup to the closest Scrollable content, so it gets the theme vars
      // (they are not set on <body>)
      return (triggerNode.closest('.os-content, body') as HTMLElement | null) ?? document.body;
    }

    function renderRow(row: TRow<T>, index: number) {
      const isSelected = row.type === 'option' && row.option.value === value;
      return (
        <div
          key={row.key}
          // Reuse antd's own classes, so the rows look like the ones of every other dropdown
          className={cx('ant-select-item', 'ant-select-item-option', {
            'ant-select-item-option-active': index === activeIndex,
            'ant-select-item-option-selected': isSelected,
          })}
          onClick={() => activateRow(row)}
          // Not `onMouseEnter`: scrolling with the keys moves rows under a resting pointer
          onMouseMove={() => index !== activeIndex && setHighlight(index)}
          {...(row.type === 'option' && {
            'data-option-list': p.name,
            'data-option-label': row.option.originalLabel ?? row.option.label,
            'data-option-value': row.option.value,
          })}
        >
          <div className="ant-select-item-option-content">
            {row.type === 'category' ? row.category.label : row.option.label}
          </div>
          {row.type === 'category' && (
            <span className={styles.chevron} aria-hidden>
              ›
            </span>
          )}
          {row.type === 'option' && row.categoryLabel && (
            <span className={styles.tag}>{row.categoryLabel}</span>
          )}
        </div>
      );
    }

    // The whole panel is ours, so the menu antd would render is ignored
    function renderPanel() {
      return (
        <div ref={popupRef} onMouseDown={onPopupMouseDown}>
          <div className={styles.header}>
            {activeCategory && (
              <div className={styles.back}>
                <span role="button" className={styles.backLink} onClick={() => showCategory(null)}>
                  ‹ {$t('All categories')}
                </span>
                <span className={styles.backTitle}>{activeCategory.label}</span>
              </div>
            )}
            <Input
              ref={searchRef}
              allowClear
              // Same search glyph as the Settings and Scene Collections search boxes
              prefix={<i className="icon-search" />}
              value={query}
              placeholder={
                activeCategory
                  ? $t('Search %{category}', { category: activeCategory.label })
                  : p.searchPlaceholder ?? $t('Search')
              }
              onChange={e => onQueryChange(e.target.value)}
              onKeyDown={onSearchKeyDown}
            />
          </div>
          {/* Remounted per view, so every view starts scrolled to the top */}
          <div
            key={activeCategory?.key ?? 'root'}
            ref={listRef}
            className={styles.list}
            style={{ maxHeight: listHeight }}
          >
            {rows.map(renderRow)}
            {rows.length === 0 && <div className="ant-select-item-empty">{$t('No matches')}</div>}
          </div>
        </div>
      );
    }

    return (
      <InputWrapper {...wrapperAttrs} nolabel={p.nolabel}>
        <Select
          ref={selectRef}
          {...omit(inputAttrs, 'onChange', 'value', 'readOnly')}
          style={{ width: '100%' }}
          labelInValue
          value={selectedValue}
          open={isOpen}
          dropdownRender={renderPanel}
          getPopupContainer={getPopupContainer}
          onDropdownVisibleChange={changeOpen}
          onClick={onSelectClick}
          onChange={next => inputAttrs.onChange(next?.value as T | undefined)}
          data-value={value}
          data-selected-option-label={selectedOption?.label}
        />
      </InputWrapper>
    );
  },
);
