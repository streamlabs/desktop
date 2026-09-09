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
          data-name={p.value === opt.value ? 'image-option-active' : `image-option-${opt.value}`}
          key={opt.value}
          className={cx(styles.imageOption, { [styles.active]: p.value === opt.value })}
          onClick={() => p.onChange && p.onChange(opt.value)}
        >
          {typeof opt.image === 'string' ? <img src={opt.image} /> : opt.image}
        </div>
      ))}
    </div>
  );
});
