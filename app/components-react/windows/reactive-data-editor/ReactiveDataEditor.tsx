import React, { useEffect, useMemo, useState } from 'react';
import cx from 'classnames';
import { TSchemaFlat, TSchemaTreeLeaf, TStateFlat, TStateTreeLeaf } from 'services/reactive-data';
import { $t } from 'services/i18n';
import { Button } from 'antd';
import { NumberInput } from 'components-react/shared/inputs/NumberInput';
import styles from './ReactiveDataEditor.m.less';

type SchemaKeys = keyof TSchemaFlat & string;

type ResolvedEntry = {
  key: SchemaKeys;
  info: TSchemaTreeLeaf;
};

const MIN_VALUE = 0;
const MAX_VALUE = 999999999;

const resolveStateKeys = (
  stateKeys: SchemaKeys[] | undefined,
  schemaEntries: TSchemaFlat,
): ResolvedEntry[] => {
  const keysToProcess = stateKeys ?? (Object.keys(schemaEntries) as SchemaKeys[]);

  console.log({ keysToProcess, schemaEntries });

  const seen = new Set<string>();
  return keysToProcess.reduce<ResolvedEntry[]>((acc, key) => {
    const keyStr = String(key);
    if (seen.has(keyStr)) return acc;
    const info = schemaEntries[key];
    if (!info) return acc;
    seen.add(keyStr);
    acc.push({ key: keyStr as SchemaKeys, info });
    return acc;
  }, []);
};

const buildInitialValues = (
  entries: ResolvedEntry[],
  state: Partial<TStateFlat>,
): Partial<TStateFlat> => {
  const values: Partial<TStateFlat> = {};
  entries.forEach(({ key }) => {
    if (state[key] !== undefined) {
      console.log({ state: JSON.stringify(state).slice(0, 30) + '...' });
      console.log('Initial value for', key, 'is', state[key]);
    }

    values[key] = state[key] ?? 0;
  });
  return values;
};

const buildInitialDirty = (entries: ResolvedEntry[]): Record<string, boolean> => {
  const record: Record<string, boolean> = {};
  entries.forEach(({ key }) => {
    record[key] = false;
  });
  return record;
};

const valueChanged = (
  prev: TStateTreeLeaf | undefined,
  next: TStateTreeLeaf | undefined,
): boolean => {
  if (next === undefined) {
    return false;
  }

  return prev !== next;
};

type ReactiveStateEditorProps = {
  filteredStateKeys?: SchemaKeys[];
  schema: TSchemaFlat;
  state: Partial<TStateFlat>;
  onSave?: (changes: Partial<TStateFlat>) => void;
  onCancel?: () => void;
};

export default function ReactiveStateEditor({
  filteredStateKeys,
  schema,
  state,
  onSave,
  onCancel,
}: ReactiveStateEditorProps) {
  const entries = useMemo(() => resolveStateKeys(filteredStateKeys, schema), [
    filteredStateKeys,
    schema,
  ]);

  const [initialValues, setInitialValues] = useState<Partial<TStateFlat>>(() =>
    buildInitialValues(entries, state),
  );

  const [values, setValues] = useState<Partial<TStateFlat>>(() =>
    buildInitialValues(entries, state),
  );

  const [dirtyMap, setDirtyMap] = useState<Record<string, boolean>>(() =>
    buildInitialDirty(entries),
  );

  useEffect(() => {
    const nextInitial = buildInitialValues(entries, state);
    setInitialValues(nextInitial);
    setValues(nextInitial);
    setDirtyMap(buildInitialDirty(entries));
  }, [entries, state]);

  const handleValueChange = (key: SchemaKeys, rawValue: string) => {
    const isEmpty = rawValue === '';
    const nextValue = isEmpty ? undefined : Number(rawValue);

    if (!isEmpty && Number.isNaN(nextValue)) {
      return;
    }

    const clampedValue =
      nextValue === undefined ? undefined : Math.max(MIN_VALUE, Math.min(MAX_VALUE, nextValue));

    setValues(prev => {
      const next = { ...prev };
      if (clampedValue === undefined) {
        delete next[key];
      } else {
        next[key] = clampedValue;
      }
      return next;
    });

    setDirtyMap(prev => ({
      ...prev,
      [key]: valueChanged(initialValues[key], clampedValue),
    }));
  };

  const countDirty = Object.values(dirtyMap).filter(dirty => dirty).length;
  const hasAnyDirty = countDirty > 0;

  const handleReset = () => {
    setValues(initialValues);
    setDirtyMap(buildInitialDirty(entries));
  };

  const handleSave = () => {
    if (!hasAnyDirty) return;

    const changes: Partial<TStateFlat> = {};
    entries.forEach(({ key }) => {
      if (!dirtyMap[key]) return;

      const nextValue = values[key];
      if (nextValue === undefined) return;

      changes[key] = nextValue;
    });

    onSave?.(changes);

    const nextInitialValues = entries.reduce<Partial<TStateFlat>>((acc, { key }) => {
      const currentValue = values[key];
      const fallback = initialValues[key] ?? 0;
      acc[key] = currentValue ?? fallback;
      return acc;
    }, {});

    setInitialValues(nextInitialValues);
    setValues(nextInitialValues);
    setDirtyMap(buildInitialDirty(entries));
  };

  const handleCancel = () => {
    onCancel?.();
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>{$t('Reactive Data')}</h2>
        <p>{$t('Manage your reactive data values')}</p>
      </div>

      <section className={styles.content}>
        <div className={styles.entriesList}>
          {entries.map(({ key, info }) => {
            const isDirty = dirtyMap[key] ?? false;

            return (
              <div key={key} className={styles.entryRow}>
                <div className={styles.entryInfo}>
                  <label
                    htmlFor={key}
                    className={cx(styles.entryLabel, { [styles.dirty]: isDirty })}
                  >
                    {info.name}
                  </label>
                  <div className={styles.entryKey}>{key.split('.')[1]}</div>
                </div>

                <div className={styles.entryInput}>
                  <NumberInput
                    value={Number(values[key]) ?? 0}
                    onChange={v =>
                      handleValueChange(key, Math.max(MIN_VALUE, Math.min(MAX_VALUE, v)).toString())
                    }
                    defaultValue={Number(values[key]) ?? 0}
                    required
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerContent}>
          {hasAnyDirty && <Button onClick={handleReset}>{$t('Reset')}</Button>}
          <div className={styles.footerActions}>
            <Button onClick={handleCancel}>{$t('Close')}</Button>
            <Button type="primary" disabled={!hasAnyDirty} onClick={handleSave}>
              {$t('Save Changes')}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}
