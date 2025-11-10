import './ReactiveDataEditor.less';

import React, { useEffect, useMemo, useState } from 'react';
import { LeafInfo } from './lib/schema';

type FlatSchema = Record<string, LeafInfo>;

type SchemaKeys<T extends FlatSchema> = keyof T & string;

type FlatState<T extends FlatSchema> = Record<SchemaKeys<T>, number>;

type ResolvedEntry<T extends FlatSchema> = {
  key: SchemaKeys<T>;
  info: LeafInfo;
};

const MIN_VALUE = 0;
const MAX_VALUE = 999999999;

const resolveStateKeys = <T extends FlatSchema>(
  stateKeys: (keyof T)[] | undefined,
  schemaEntries: T,
): ResolvedEntry<T>[] => {
  const keysToProcess = stateKeys ?? (Object.keys(schemaEntries) as (keyof T)[]);

  const seen = new Set<string>();
  return keysToProcess.reduce<ResolvedEntry<T>[]>((acc, key) => {
    const keyStr = String(key);
    if (seen.has(keyStr)) return acc;
    const info = schemaEntries[key];
    if (!info) return acc;
    seen.add(keyStr);
    acc.push({ key: keyStr as SchemaKeys<T>, info });
    return acc;
  }, []);
};

const buildInitialValues = <T extends FlatSchema>(
  entries: ResolvedEntry<T>[],
  state: Partial<Record<string, number>>,
): Partial<FlatState<T>> => {
  const values: Partial<FlatState<T>> = {};
  entries.forEach(({ key }) => {
    if (state[key] !== undefined) {
      console.log({ state: JSON.stringify(state).slice(0, 30) + '...' });
      console.log('Initial value for', key, 'is', state[key]);
    }

    values[key] = state[key] ?? 0;
  });
  return values;
};

const buildInitialDirty = <T extends FlatSchema>(
  entries: ResolvedEntry<T>[],
): Record<string, boolean> => {
  const record: Record<string, boolean> = {};
  entries.forEach(({ key }) => {
    record[key] = false;
  });
  return record;
};

const valueChanged = (prev: number | undefined, next: number | undefined): boolean => {
  if (next === undefined) {
    return false;
  }

  return prev !== next;
};

type ReactiveStateEditorProps<T extends FlatSchema> = {
  filteredStateKeys?: (keyof T)[];
  schema: T;
  state: Partial<Record<string, number>>;
  onSave?: (changes: Partial<Record<string, number>>) => void;
  onCancel?: () => void;
};

export default function ReactiveStateEditor<T extends FlatSchema>({
  filteredStateKeys,
  schema,
  state,
  onSave,
  onCancel,
}: ReactiveStateEditorProps<T>) {
  const entries = useMemo(() => resolveStateKeys(filteredStateKeys, schema), [
    filteredStateKeys,
    schema,
  ]);

  const [initialValues, setInitialValues] = useState<Partial<FlatState<T>>>(() =>
    buildInitialValues(entries, state),
  );

  const [values, setValues] = useState<Partial<FlatState<T>>>(() =>
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

  const handleValueChange = (key: SchemaKeys<T>, rawValue: string) => {
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

    const changes: Partial<Record<string, number>> = {};
    entries.forEach(({ key }) => {
      if (!dirtyMap[key]) return;

      const nextValue = values[key];
      if (nextValue === undefined) return;

      changes[key] = nextValue;
    });

    onSave?.(changes);

    const nextInitialValues = entries.reduce<Partial<FlatState<T>>>((acc, { key }) => {
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
    <div className="rsePlain-container">
      <div className="rsePlain-header">
        <h2 className="rsePlain-title">Reactive State</h2>
        <p className="rsePlain-subtitle">Manage your reactive state values</p>
      </div>

      <section className="rsePlain-body">
        <div className="rsePlain-rows">
          {entries.map(({ key, info }) => {
            const isDirty = dirtyMap[key] ?? false;
            const inputClassName = ['rsePlain-input', isDirty ? 'rsePlain-input--dirty' : '']
              .filter(Boolean)
              .join(' ');

            const labelClassName = ['rsePlain-label', isDirty ? 'rsePlain-label--dirty' : '']
              .filter(Boolean)
              .join(' ');

            return (
              <div key={key} className="rsePlain-row">
                <div className="rsePlain-labelContainer">
                  <label htmlFor={key} className={labelClassName}>
                    {info.name}
                  </label>
                  <div className="rsePlain-key">{key.split('.')[1]}</div>
                </div>

                <div className="rsePlain-inputWrapper">
                  <input
                    id={key}
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min={MIN_VALUE}
                    max={MAX_VALUE}
                    value={values[key] ?? ''}
                    onChange={event => handleValueChange(key, event.target.value)}
                    className={inputClassName}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="rsePlain-footer">
        <div className="rsePlain-footerContent">
          {hasAnyDirty && (
            <button
              type="button"
              onClick={handleReset}
              className="rsePlain-button rsePlain-button--reset"
            >
              Reset
            </button>
          )}
          <div className="rsePlain-actionGroup">
            <button
              type="button"
              onClick={handleCancel}
              className="rsePlain-button rsePlain-button--secondary"
            >
              Close
            </button>
            <button
              type="button"
              disabled={!hasAnyDirty}
              onClick={handleSave}
              className={[
                'rsePlain-button',
                'rsePlain-button--primary',
                hasAnyDirty ? '' : 'rsePlain-button--primaryDisabled',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {countDirty
                ? `Save ${countDirty} Change${countDirty === 1 ? '' : 's'}`
                : 'Save Changes'}
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
