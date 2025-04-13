import React from 'react';
import { $t } from 'services/i18n';
import { NumberInput } from 'components-react/shared/inputs';
import InputWrapper from 'components-react/shared/inputs/InputWrapper';
import styles from './RotateInput.m.less';
import debounce from 'lodash/debounce';

interface RotateInputProps {
  value: number;
  handleInput: (val: number, isDelta?: boolean) => void;
}

const MIN_ROTATION = -359;
const MAX_ROTATION = 360;
const ROTATE_STEP = 0.1;
const DEBOUNCE_TIME = 1000;

const formatter = (value: number | string) => {
  // for when the input gets clears
  const val = typeof value === 'string' && !value.length ? '0.0' : value;

  return `${val}°`;
};

const parser = (value: string) => {
  const val = value.replace('°', '');
  return Number.isNaN(Number(val)) ? 0.0 : Number(val);
};

export const RotateInput = (props: RotateInputProps) => {
  const { value, handleInput } = props;

  const rotateLeft = () => handleInput(-90);
  const rotateRight = () => handleInput(90);
  const rotate = debounce((deg: number) => handleInput(deg, false), DEBOUNCE_TIME);

  return (
    <InputWrapper label={$t('Rotation')} className={styles.wrapper}>
      <NumberInput
        nowrap
        value={value}
        defaultValue={0}
        min={MIN_ROTATION}
        max={MAX_ROTATION}
        step={ROTATE_STEP}
        precision={2}
        onChange={rotate}
      />

      <button
        className="button icon-button"
        onClick={rotateLeft}
        title={$t('Rotate 90 Degrees CCW')}
      >
        <i className="fas fa-undo" />
      </button>

      <button
        className="button icon-button"
        onClick={rotateRight}
        title={$t('Rotate 90 Degrees CW')}
      >
        <i className="fas fa-redo" />
      </button>
    </InputWrapper>
  );
};
