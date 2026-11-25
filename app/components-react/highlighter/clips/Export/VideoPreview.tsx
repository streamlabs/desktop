import React, { useRef } from 'react';
import { Services } from 'components-react/service-provider';
import styles from './ExportModal.m.less';

export default function VideoPreview() {
  const { HighlighterService } = Services;
  const exportInfo = useRef(
    HighlighterService.views.getCacheBustingUrl(HighlighterService.views.exportInfo.file),
  );

  return (
    <div className={styles.videoPreview}>
      <video src={exportInfo.current} controls />
    </div>
  );
}
