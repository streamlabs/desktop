import React, { useEffect, useMemo, useState } from 'react';

type LeafInfo = {
  name: string;
};

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

const colors = {
  dark1: '#09161D',
  dark2: '#17242D',
  dark3: '#2B383F',
  dark4: '#4F5E65',
  streamlabs: '#80f5d2',
  grey: '#91979A',
  light4: '#BDC2C4',
  borderWhite10: 'rgba(255, 255, 255, 0.1)',
  borderWhite20: 'rgba(255, 255, 255, 0.2)',
  borderWhite30: 'rgba(255, 255, 255, 0.3)',
  borderWhite5: 'rgba(255, 255, 255, 0.05)',
  textWhite90: 'rgba(255, 255, 255, 0.9)',
  textWhite60: 'rgba(255, 255, 255, 0.6)',
  textWhite40: 'rgba(255, 255, 255, 0.4)',
  textWhite20: 'rgba(255, 255, 255, 0.2)',
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        border: `1px solid ${colors.borderWhite10}`,
        backgroundColor: colors.dark1,
      }}
    >
      <div
        style={{
          borderBottom: `1px solid ${colors.borderWhite10}`,
          backgroundColor: 'rgba(23, 36, 45, 0.5)',
          padding: '16px 24px',
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: '1.125rem',
            fontWeight: 600,
            letterSpacing: '-0.01em',
            color: '#ffffff',
          }}
        >
          Reactive State
        </h2>
        <p
          style={{
            marginTop: '4px',
            fontSize: '0.875rem',
            color: colors.textWhite60,
          }}
        >
          Manage your reactive state values
        </p>
      </div>

      <section
        style={{
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            borderTop: '1px solid transparent',
          }}
        >
          {entries.map(({ key, info }, index) => {
            const isDirty = dirtyMap[key] ?? false;

            return (
              <div
                key={key}
                style={{
                  display: 'flex',
                  flexDirection: 'row',
                  gap: '12px',
                  padding: '16px 24px',
                  transition: 'background-color 0.2s ease',
                  borderTop: index === 0 ? 'none' : `1px solid ${colors.borderWhite5}`,
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  <label
                    htmlFor={key}
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      color: isDirty ? colors.streamlabs : colors.textWhite90,
                      transition: 'color 0.2s ease',
                    }}
                  >
                    {info.name}
                  </label>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: colors.textWhite60,
                    }}
                  >
                    {key.split('.')[1]}
                  </div>
                </div>

                <div
                  style={{
                    width: '200px',
                  }}
                >
                  <input
                    id={key}
                    type="number"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    min={MIN_VALUE}
                    max={MAX_VALUE}
                    value={values[key] ?? ''}
                    onChange={event => handleValueChange(key, event.target.value)}
                    style={{
                      width: '100%',
                      height: '36px',
                      borderRadius: '6px',
                      border: isDirty
                        ? '1px solid rgba(128, 245, 210, 0.5)'
                        : `1px solid ${colors.borderWhite10}`,
                      backgroundColor: isDirty ? 'rgba(128, 245, 210, 0.05)' : 'transparent',
                      padding: '4px 12px',
                      fontSize: '0.875rem',
                      color: '#ffffff',
                      boxShadow: isDirty
                        ? '0 0 0 1px rgba(128, 245, 210, 0.2)'
                        : '0 1px 2px rgba(0, 0, 0, 0.3)',
                      outline: 'none',
                      transition:
                        'border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <footer
        style={{
          borderTop: `1px solid ${colors.borderWhite10}`,
          backgroundColor: 'rgba(23, 36, 45, 0.5)',
          padding: '16px 24px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          {hasAnyDirty && (
            <button
              type="button"
              onClick={handleReset}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '36px',
                padding: '0 16px',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
                border: 'none',
                background: 'transparent',
                color: '#ffffff',
                transition:
                  'background-color 0.2s ease, color 0.2s ease, opacity 0.2s ease, box-shadow 0.2s ease',
              }}
            >
              Reset
            </button>
          )}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginLeft: 'auto',
            }}
          >
            <button
              type="button"
              onClick={handleCancel}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '36px',
                padding: '0 16px',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: 'pointer',
                border: `1px solid ${colors.borderWhite10}`,
                background: 'transparent',
                color: colors.textWhite90,
                transition:
                  'background-color 0.2s ease, color 0.2s ease, opacity 0.2s ease, box-shadow 0.2s ease',
              }}
            >
              Close
            </button>
            <button
              type="button"
              disabled={!hasAnyDirty}
              onClick={handleSave}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '36px',
                padding: '0 16px',
                borderRadius: '6px',
                fontSize: '0.875rem',
                fontWeight: 600,
                cursor: hasAnyDirty ? 'pointer' : 'not-allowed',
                border: 'none',
                backgroundColor: hasAnyDirty ? '#ffffff' : 'rgba(255, 255, 255, 0.1)',
                color: hasAnyDirty ? '#0f172a' : colors.textWhite40,
                boxShadow: hasAnyDirty ? '0 4px 12px rgba(15, 23, 42, 0.25)' : 'none',
                transition:
                  'background-color 0.2s ease, color 0.2s ease, opacity 0.2s ease, box-shadow 0.2s ease',
              }}
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
