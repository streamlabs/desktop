import { Services } from 'components-react/service-provider';
import React, { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import Display from 'components-react/shared/Display';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import { Button, Menu, Modal } from 'antd';
import Scrollable from 'components-react/shared/Scrollable';
import { ListInput, TextInput } from 'components-react/shared/inputs';
import { useChildWindowParams, useVuex } from 'components-react/hooks';
import Form, { useForm } from 'components-react/shared/inputs/Form';
import { TObsFormData } from 'components/obs/inputs/ObsInput';
import { ObsForm } from 'components-react/obs/ObsForm';
import widgetsCss from 'components-react/widgets/common/WidgetLayout.m.less';
import css from './SourceFilters.m.less';
import { ReactSortable } from 'react-sortablejs';
import cx from 'classnames';
import { TSourceFilterType } from 'services/source-filters';
import { $t } from 'services/i18n';

const FilterMenuContainer = forwardRef<HTMLUListElement>((props, ref) => {
  return (
    <ul className="ant-menu ant-menu-root ant-menu-vertical ant-menu-dark" ref={ref}>
      {props.children}
    </ul>
  );
});

export default function SourceFilters() {
  const { WindowsService, SourceFiltersService, SourcesService, EditorCommandsService } = Services;
  const sourceId = useChildWindowParams('sourceId');
  const { filters, isVisual, preset } = useVuex(() => ({
    filters: SourceFiltersService.views.filtersBySourceId(sourceId),
    isVisual: !!SourcesService.views.getSource(sourceId)?.video,
    preset: SourceFiltersService.views.presetFilterBySourceId(sourceId),
  }));
  const presetValue = preset
    ? SourceFiltersService.views.parsePresetValue(preset.settings.image_path as string)
    : 'none';
  const [selectedFilter, setSelectedFilter] = useState(
    filters && filters.length > 0 ? filters[0].name : null,
  );
  const [formData, setFormData] = useState<TObsFormData | null>();
  const [modal, setModal] = useState(false);

  // Handle switching to a different filter if the once we selected is
  // no longer available.
  if (selectedFilter && !filters?.find(f => f.name === selectedFilter)) {
    if (filters?.length) {
      setSelectedFilter(filters[0].name);
    } else {
      setSelectedFilter(null);
    }
  }

  function setPreset(val: string) {
    if (val === 'none') {
      SourceFiltersService.actions.removePresetFilter(sourceId);
    } else {
      SourceFiltersService.actions.addPresetFilter(sourceId, val);
    }
  }

  function loadFormData(filterName: string) {
    if (selectedFilter) {
      setFormData(SourceFiltersService.getPropertiesFormData(sourceId, filterName));
    }
  }

  // There's no good way to make this reactive with good
  // performance currently, so we rely on events.
  useEffect(() => {
    if (!selectedFilter) return;
    loadFormData(selectedFilter);

    const subscription = SourceFiltersService.filterUpdated.subscribe(filter => {
      if (filter.name === selectedFilter) {
        loadFormData(selectedFilter);
      }
    });

    return () => subscription.unsubscribe();
  }, [sourceId, selectedFilter]);

  // Close the window when the source is removed
  useEffect(() => {
    const subscription = SourcesService.sourceRemoved.subscribe(s => {
      if (s.sourceId === sourceId) {
        WindowsService.actions.closeChildWindow();
      }
    });

    return () => subscription.unsubscribe();
  }, [sourceId]);

  const addFilterKey = '__AddNewFilter';

  return (
    <ModalLayout
      fixedChild={modal ? <div /> : <Display sourceId={sourceId} />}
      bodyStyle={{ padding: 0 }}
    >
      <div
        style={{ display: 'flex', borderTop: '1px solid var(--border)', height: '100%' }}
        className={widgetsCss.widgetLayout}
      >
        <div
          style={{
            width: 270,
            borderRight: '1px solid var(--border)',
            height: '100%',
            background: 'var(--section)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {isVisual && (
            <div style={{ padding: '20px 20px 0' }}>
              <Form layout="vertical">
                <ListInput
                  label="Visual Preset"
                  options={SourceFiltersService.views.presetFilterOptionsReact}
                  value={presetValue}
                  onChange={setPreset}
                  allowClear={false}
                ></ListInput>
              </Form>
            </div>
          )}
          <Menu theme="dark" selectable={false} onClick={() => setModal(true)}>
            {isVisual && <Menu.Divider />}
            <Menu.Item key={addFilterKey}>
              <i className="icon-add" style={{ marginRight: 8 }} />
              Add Filter
            </Menu.Item>
            <Menu.Divider />
          </Menu>
          <Scrollable style={{ flexGrow: 1 }}>
            <ReactSortable
              list={filters?.map(f => {
                return { id: f.name };
              })}
              setList={() => {}}
              onEnd={e => {
                if (!filters) return;
                const filterName = filters[e.oldIndex!].name;
                // Executes synchronously to avoid visual jank on drop
                EditorCommandsService.executeCommand(
                  'ReorderFiltersCommand',
                  sourceId,
                  filterName,
                  e.newIndex! - e.oldIndex!,
                );
              }}
              tag={FilterMenuContainer}
              animation={200}
            >
              {filters?.map(filter => {
                return (
                  <li
                    key={filter.name}
                    className={cx(css.filterMenuItem, 'ant-menu-item', {
                      ['ant-menu-item-selected']: filter.name === selectedFilter,
                    })}
                    onClick={() => setSelectedFilter(filter.name)}
                  >
                    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
                      <span
                        style={{
                          flexGrow: 1,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {filter.name}
                      </span>
                      <i
                        className={`${
                          filter.visible ? 'icon-view' : 'icon-hide'
                        } icon-button icon-button--lg`}
                        onClick={e => {
                          e.stopPropagation();
                          EditorCommandsService.actions.executeCommand(
                            'ToggleFilterCommand',
                            sourceId,
                            filter.name,
                          );
                        }}
                      />
                      <i
                        className="icon-trash icon-button icon-button--lg"
                        onClick={e => {
                          e.stopPropagation();
                          EditorCommandsService.actions.executeCommand(
                            'RemoveFilterCommand',
                            sourceId,
                            filter.name,
                          );
                        }}
                      />
                    </div>
                  </li>
                );
              })}
            </ReactSortable>
          </Scrollable>
        </div>
        <div style={{ flexGrow: 1 }}>
          <Scrollable style={{ height: '100%' }}>
            {selectedFilter && formData && !!formData.length && (
              <ObsForm
                value={formData}
                onChange={newData => {
                  EditorCommandsService.actions.executeCommand(
                    'EditFilterPropertiesCommand',
                    sourceId,
                    selectedFilter,
                    newData,
                  );
                }}
                layout="horizontal"
                style={{ padding: 20 }}
                key={selectedFilter}
              />
            )}
            {selectedFilter && !formData?.length && (
              <div style={{ padding: 20 }}>{$t('No settings are available for this filter')}</div>
            )}
          </Scrollable>
        </div>
      </div>
      <Modal footer={null} visible={modal} onCancel={() => setModal(false)} getContainer={false}>
        <CreateFilterForm
          sourceId={sourceId}
          onSubmit={name => {
            setModal(false);
            setSelectedFilter(name);
          }}
        />
      </Modal>
    </ModalLayout>
  );
}

function CreateFilterForm(p: { sourceId: string; onSubmit: (filterName: string) => void }) {
  const { SourceFiltersService, EditorCommandsService } = Services;
  // Not reactive because available source types never change
  const types = SourceFiltersService.views.getTypesForSource(p.sourceId).map(t => {
    return {
      value: t.type,
      label: t.description,
    };
  });
  const [type, setTypeState] = useState<TSourceFilterType>(types[0].value);
  const [name, setName] = useState(
    SourceFiltersService.views.suggestName(p.sourceId, types[0].label),
  );
  const form = useForm();

  function setType(type: TSourceFilterType) {
    setName(
      SourceFiltersService.views.suggestName(p.sourceId, types.find(t => t.value === type)?.label!),
    );
    setTypeState(type);
  }

  function submit() {
    //@ts-ignore typescript upgrade
    EditorCommandsService.actions.return
      .executeCommand('AddFilterCommand', p.sourceId, type, name)
      // @ts-ignore
      .then(() => {
        p.onSubmit(name);
      });
  }

  function uniqueNameValidator(rule: unknown, value: string, callback: (message?: string) => void) {
    // A small hack to check if the name is taken
    const suggested = SourceFiltersService.views.suggestName(p.sourceId, value);

    if (value === suggested) {
      callback();
    } else {
      callback($t('That name is already taken'));
    }
  }

  return (
    <>
      <h2>Add New Filter</h2>
      <Form onFinish={submit} form={form} name="addFilterForm">
        <ListInput
          value={type}
          onChange={v => setType(v)}
          options={types}
          label={$t('Filter type')}
          name="filterType"
        />
        <TextInput
          value={name}
          onChange={v => setName(v)}
          label={$t('Filter name')}
          rules={[
            { required: true },
            { type: 'string', min: 1 },
            { validator: uniqueNameValidator },
          ]}
          uncontrolled={false}
          name="filterName"
        />
        <div style={{ textAlign: 'right' }}>
          <Button type="primary" htmlType="submit">
            {$t('Add')}
          </Button>
        </div>
      </Form>
    </>
  );
}
