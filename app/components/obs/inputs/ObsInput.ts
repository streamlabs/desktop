import TsxComponent from 'components/tsx-component';

// Types and helpers live in services/sources/obs-properties; re-exported for legacy Vue consumers
export * from 'services/sources/obs-properties';

export abstract class ObsInput<TValueType> extends TsxComponent<{
  value: TValueType;
  onInput: (value: TValueType) => void;
}> {
  abstract value: TValueType;

  emitInput(eventData: TValueType) {
    this.$emit('input', eventData);
  }
}
