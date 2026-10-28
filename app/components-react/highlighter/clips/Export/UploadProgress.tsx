import React, { useEffect } from 'react';
import { Progress } from 'antd';
import { Services } from 'components-react/service-provider';
import { useVuex } from 'components-react/hooks';
import { $t } from 'services/i18n';
import styles from './ExportModal.m.less';
import { EUploadPlatform } from 'services/highlighter/models/highlighter.models';

// Source: https://stackoverflow.com/questions/10420352/converting-file-size-in-bytes-to-human-readable-string/10420404
function humanFileSize(bytes: number, si: boolean) {
  const thresh = si ? 1000 : 1024;
  if (Math.abs(bytes) < thresh) {
    return bytes + ' B';
  }
  const units = si
    ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
    : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
  let u = -1;
  do {
    bytes /= thresh;
    ++u;
  } while (Math.abs(bytes) >= thresh && u < units.length - 1);
  return bytes.toFixed(1) + ' ' + units[u];
}

export default function UploadProgress({
  platform,
  dense,
}: {
  platform: EUploadPlatform;
  dense?: boolean;
}) {
  const { HighlighterService } = Services;
  const { uploadInfo } = useVuex(() => ({
    uploadInfo: HighlighterService.getUploadInfo(HighlighterService.views.uploadInfo, platform),
  }));

  if (uploadInfo === undefined) {
    return <div>{$t('Something went wrong. Please contact support if the issue persists')}</div>;
  }

  return (
    <div style={{ marginTop: dense ? '0' : '16px' }}>
      {!dense && <h2>{$t('Upload Progress')}</h2>}
      <Progress
        percent={Math.round((uploadInfo.uploadedBytes / uploadInfo.totalBytes) * 100)}
        trailColor="var(--section)"
        status={uploadInfo.cancelRequested ? 'exception' : 'normal'}
        style={{ marginTop: dense ? '0' : '16px' }}
      />
      {!uploadInfo.cancelRequested && (
        <div style={{ fontSize: dense ? '12px' : 'inherit' }}>
          {$t('Uploading: %{uploadedBytes}/%{totalBytes}', {
            uploadedBytes: humanFileSize(uploadInfo.uploadedBytes, false),
            totalBytes: humanFileSize(uploadInfo.totalBytes, false),
          })}
        </div>
      )}
      {uploadInfo.cancelRequested && <span>{$t('Canceling...')}</span>}
      {dense ? (
        <button
          className={styles.uploadButton}
          onClick={() => HighlighterService.actions.cancelUpload(platform)}
          disabled={uploadInfo.cancelRequested}
          style={{ color: 'var(--warning)' }}
        >
          {$t('Cancel')}
        </button>
      ) : (
        <>
          <br />
          <button
            className="button button--soft-warning"
            onClick={() => HighlighterService.actions.cancelUpload(platform)}
            style={{ marginTop: dense ? '0' : '16px' }}
            disabled={uploadInfo.cancelRequested}
          >
            {$t('Cancel')}
          </button>
        </>
      )}
    </div>
  );
}
