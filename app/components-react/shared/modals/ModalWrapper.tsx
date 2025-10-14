import React from 'react';
import Animation from 'rc-animate';
import { IModalOptions } from 'services/windows';

/**
 * Shows an animated modal
 */
export default function ModalWrapper(p: IModalOptions) {
  return (
    <div style={{ position: 'absolute' }}>
      <Animation transitionName="antd-fade">{p?.renderFn && p.renderFn()}</Animation>
    </div>
  );
}
