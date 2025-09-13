import React from 'react';
import cx from 'classnames';
import { InputComponent } from './inputs';
import styles from './ImagePickerInput.m.less';
import { TListInputProps } from './ListInput';

export const ImagePickerInput = InputComponent((p: TListInputProps<string>) => {
  return (
    <div className={styles.imagePicker}>
      {p.options?.map(opt => (
        <div
          key={opt.value}
          className={cx(styles.imageOption, p.value === opt.value && styles.active)}
          onClick={() => p.onInput && p.onInput(opt.value)}
        >
          {typeof opt.image === 'string' ? <img src={opt.image} /> : opt.image}
        </div>
      ))}
    </div>
  );
});
