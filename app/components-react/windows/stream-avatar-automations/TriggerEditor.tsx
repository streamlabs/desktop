import React, { useMemo } from 'react';
import { Input, InputNumber, Select, Slider } from 'antd';
import { CategoryListInput } from 'components-react/shared/inputs';
import { $t } from 'services/i18n';
import { Properties } from 'services/stream-avatar/engine/properties';
import { Conditions } from 'services/stream-avatar/engine/conditions';
import type { ConditionType } from 'services/stream-avatar/engine/conditions';
import { triggerSourceCategories } from './automations-utils';
import styles from './AutomationEditor.m.less';

export interface TriggerValue {
  source: string;
  type: ConditionType | '';
  props: Record<string, unknown>;
}

export interface TriggerEditorProps {
  index: number;
  trigger: TriggerValue;
  valueError?: string;
  canRemove: boolean;
  onChange: (index: number, trigger: TriggerValue) => void;
  onRemove: (index: number) => void;
}

function getConditionOptions(source: string) {
  return Object.entries(Conditions())
    .filter(([, def]) => def.group === source && !def.disabled)
    .map(([key, def]) => ({ label: def.label, value: key as ConditionType }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

function findAlertCondition(type: ConditionType | '') {
  return type
    ? Object.values(Conditions()[type]?.properties ?? {}).find(
        (p): p is InstanceType<typeof Properties.AlertCondition> =>
          p instanceof Properties.AlertCondition,
      )
    : undefined;
}

/** Alert conditions like "amount is at least" need a number/tier/text to compare against. */
export function isTriggerValueMissing({
  type,
  props,
}: Pick<TriggerValue, 'type' | 'props'>): boolean {
  const alertCondition = findAlertCondition(type);
  const alertOption = alertCondition?.config.options.find(
    o => o.value === (props.condition ?? alertCondition.config.default?.condition),
  );
  const value = props.value;
  const valueMissing = value == null || (typeof value === 'string' && value.trim() === '');
  return !!alertOption?.input && valueMissing;
}

export default function TriggerEditor({
  index,
  trigger,
  valueError,
  canRemove,
  onChange,
  onRemove,
}: TriggerEditorProps) {
  const { source, type, props } = trigger;
  const conditionOptions = getConditionOptions(source);
  // CategoryListInput is memoised on its props, so keep the categories array stable.
  const sourceCategories = useMemo(() => triggerSourceCategories(), []);

  function setSource(nextSource: string) {
    // The previous condition belongs to the old source, so start the row over.
    onChange(index, { source: nextSource, type: '', props: {} });
  }

  function setType(nextType: ConditionType) {
    const def = Conditions()[nextType];
    const defaults: Record<string, unknown> = {};
    if (def?.properties) {
      for (const [key, prop] of Object.entries(def.properties)) {
        if (prop instanceof Properties.AlertCondition) {
          // Alert conditions store flat props ({ condition, value }), not nested under the key.
          Object.assign(defaults, prop.config.default);
        } else if ('default' in prop.config) {
          defaults[key] = prop.config.default;
        }
      }
    }
    onChange(index, { source, type: nextType, props: defaults });
  }

  function setProps(nextProps: Record<string, unknown>) {
    onChange(index, { ...trigger, props: nextProps });
  }

  // Rendered straight into the content grid, so a property is one cell or a pair of cells.
  function renderProperties() {
    if (!type) return null;
    const def = Conditions()[type];
    if (!def?.properties) return null;
    return Object.entries(def.properties).map(([key, prop]) => {
      if (prop instanceof Properties.SliderRange) {
        const { min, max, step, label } = prop.config;
        const value = (props[key] as [number, number]) ?? prop.config.default;
        return (
          <div key={key} className={styles.propertyBlock}>
            <div className={styles.propertyHeader}>
              <span className={styles.propertyLabel}>{label}</span>
              <span className={styles.propertyValue}>
                {value[0]} – {value[1]}
              </span>
            </div>
            <Slider
              range
              min={min}
              max={max}
              step={step}
              value={value}
              onChange={val => setProps({ ...props, [key]: val })}
            />
          </div>
        );
      }
      if (prop instanceof Properties.AlertCondition) {
        const { label, options } = prop.config;
        const selected =
          (props.condition as string | undefined) ?? prop.config.default?.condition ?? 'any';
        const input = options.find(o => o.value === selected)?.input;
        const rawValue = props.value;
        const value = typeof rawValue === 'number' ? rawValue : undefined;
        const textValue = typeof rawValue === 'string' ? rawValue : '';
        return (
          <React.Fragment key={key}>
            <div className={styles.field}>
              <label className={styles.sectionTitle}>{label}</label>
              <Select
                value={selected}
                options={options.map(o => ({ label: o.label, value: o.value }))}
                onChange={val => {
                  // Keep the number only when the new option takes the same kind of input.
                  const nextInput = options.find(o => o.value === val)?.input;
                  const { value: prevValue, ...rest } = props;
                  setProps({
                    ...rest,
                    condition: val,
                    ...(nextInput && nextInput === input ? { value: prevValue } : {}),
                  });
                }}
              />
            </div>
            {input && (
              <div className={styles.field}>
                <label className={styles.sectionTitle}>{$t('Value')}</label>
                {input === 'number' && (
                  <InputNumber
                    // "Every N" streaks need a whole number of at least 1.
                    min={selected === 'every' ? 1 : 0}
                    precision={selected === 'every' ? 0 : undefined}
                    value={value}
                    placeholder={$t('Enter a value')}
                    onChange={val => setProps({ ...props, value: val ?? undefined })}
                  />
                )}
                {input === 'tier' && (
                  <Select
                    value={value}
                    placeholder={$t('Select a tier')}
                    options={[
                      { label: $t('Tier 1'), value: 1 },
                      { label: $t('Tier 2'), value: 2 },
                      { label: $t('Tier 3'), value: 3 },
                    ]}
                    onChange={val => setProps({ ...props, value: val })}
                  />
                )}
                {input === 'text' && (
                  <Input
                    value={textValue}
                    placeholder={$t('Enter a value')}
                    onChange={e =>
                      setProps({
                        ...props,
                        value: e.target.value === '' ? undefined : e.target.value,
                      })
                    }
                  />
                )}
                {valueError && <p className={styles.errorText}>{valueError}</p>}
              </div>
            )}
          </React.Fragment>
        );
      }
      return null;
    });
  }

  return (
    <div className={styles.triggerRow}>
      <span className={styles.triggerIndex}>{String(index + 1).padStart(2, '0')}</span>
      <div className={styles.triggerContent}>
        <CategoryListInput
          // `nowrap` skips the Form.Item wrapper, whose bottom margin would unalign the grid row.
          nowrap
          value={source || undefined}
          onChange={val => val && setSource(val)}
          categories={sourceCategories}
          searchPlaceholder={$t('Search all trigger sources')}
          placeholder={$t('Select a trigger source')}
        />
        <Select
          value={type || undefined}
          onChange={val => setType(val as ConditionType)}
          placeholder={$t('Select an event')}
          options={conditionOptions}
        />
        {/* Always render the cell so the selects don't change width when the button hides. */}
        <div className={styles.triggerTrash}>
          {canRemove && (
            <button
              type="button"
              className={styles.trashButton}
              onClick={() => onRemove(index)}
              title={$t('Remove trigger')}
              aria-label={$t('Remove trigger')}
            >
              <i className="icon-trash" />
            </button>
          )}
        </div>
        {renderProperties()}
      </div>
    </div>
  );
}
