import React, { useRef } from 'react';
import { Services } from 'components-react/service-provider';
import styles from './ExportModal.m.less';

export default function VideoPreview({ path }: { path: string }) {
  return (
    <div className={styles.videoPreview}>
      <video src={path} controls />
    </div>
  );
}
