import React, { useRef, useState } from 'react';
import * as remote from '@electron/remote';
import cx from 'classnames';
import { ReactSortable } from 'react-sortablejs';
import { IObsEditableListInputValue, TObsStringList } from 'services/sources/obs-properties';
import { Menu } from 'util/menus/Menu';
import InputWrapper from '../shared/inputs/InputWrapper';
import styles from './ObsEditableListInput.m.less';

interface IProps {
  /** The full property (name, description, filters, defaultPath, value) */
  input: IObsEditableListInputValue;
  label?: string;
  /** Emits the new list in the `TObsStringList` shape */
  onChange: (value: TObsStringList) => unknown;
}

/**
 * Editable list of paths (OBS_PROPERTY_EDITABLE_LIST). Items are added through native
 * dialogs, can be selected, reordered by dragging, replaced and removed.
 */
export function ObsEditableListInput(p: IProps) {
  const list = (p.input.value || []).map(item => item.value);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // async dialog callbacks must use the latest props
  const latest = useRef({ list, input: p.input, onChange: p.onChange });
  latest.current = { list, input: p.input, onChange: p.onChange };

  // built on demand like other React context menus (Mixer, SceneSelector);
  // labels are untranslated, as in the legacy component
  function showAddMenu() {
    const menu = new Menu();
    menu.append({ label: 'Add Files', click: () => showFileDialog() });
    menu.append({ label: 'Add Directory', click: () => showDirDialog() });
    menu.popup();
  }

  function setList(newList: string[]) {
    latest.current.onChange(newList.map(item => ({ value: item })));
  }

  async function showFileDialog() {
    const { input } = latest.current;
    const { filePaths } = await remote.dialog.showOpenDialog({
      defaultPath: input.defaultPath,
      filters: input.filters,
      properties: ['openFile', 'multiSelections'],
    });
    if (filePaths && filePaths.length) setList(latest.current.list.concat(filePaths));
  }

  async function showDirDialog() {
    const { input } = latest.current;
    const { filePaths } = await remote.dialog.showOpenDialog({
      defaultPath: input.defaultPath,
      properties: ['openDirectory'],
    });
    if (filePaths && filePaths.length) setList(latest.current.list.concat(filePaths));
  }

  async function showReplaceFileDialog(index: number) {
    const { input } = latest.current;
    const { filePaths } = await remote.dialog.showOpenDialog({
      defaultPath: input.defaultPath,
      filters: input.filters,
      properties: ['openFile'],
    });
    if (!filePaths || !filePaths.length) return;
    const newList = [...latest.current.list];
    newList[index] = filePaths[0];
    setList(newList);
  }

  function handleRemove() {
    if (activeIndex === null) return;
    setList(list.filter((_, i) => i !== activeIndex));
    setActiveIndex(null);
  }

  function handleEdit() {
    if (activeIndex === null || activeIndex >= list.length) return;
    showReplaceFileDialog(activeIndex);
  }

  function handleSort(oldIndex: number, newIndex: number) {
    if (oldIndex === newIndex) return;
    const newList = [...list];
    const [moved] = newList.splice(oldIndex, 1);
    newList.splice(newIndex, 0, moved);
    setList(newList);

    // keep the selection on the same item
    if (activeIndex === null) return;
    if (activeIndex === oldIndex) {
      setActiveIndex(newIndex);
    } else {
      let idx = activeIndex;
      if (oldIndex < idx) idx--;
      if (newIndex <= idx) idx++;
      setActiveIndex(idx);
    }
  }

  return (
    <InputWrapper label={p.label ?? p.input.description}>
      <div
        className={styles.editableList}
        data-role="input"
        data-type="editable-list"
        data-name={p.input.name}
        data-value={JSON.stringify(list)}
      >
        <div className={styles.bar}>
          <i className="icon-add icon-button" onClick={showAddMenu} />
          <i className="icon-subtract icon-button" onClick={handleRemove} />
          <i className="icon-settings icon-button" onClick={handleEdit} />
        </div>
        <ReactSortable
          tag="ul"
          className={styles.list}
          list={list.map((_, i) => ({ id: String(i) }))}
          setList={() => {}}
          onEnd={e => {
            if (e.oldIndex === undefined || e.newIndex === undefined) return;
            handleSort(e.oldIndex, e.newIndex);
          }}
          animation={200}
        >
          {list.map((item, i) => (
            <li
              key={i}
              className={cx(styles.item, { [styles.active]: i === activeIndex })}
              title={item}
              onClick={() => setActiveIndex(i)}
            >
              {item}
            </li>
          ))}
        </ReactSortable>
      </div>
    </InputWrapper>
  );
}
