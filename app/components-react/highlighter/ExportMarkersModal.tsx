import React, { useEffect, useRef, useState } from 'react';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import { sortClipsByOrder, getCombinedClipsDuration } from './utils';
import styles from './PreviewModal.m.less';
import { useVuex } from 'components-react/hooks';
import { Button, Select, Checkbox, Typography } from 'antd';
import { dialog } from '@electron/remote';
const { Option } = Select;

export default function ExportMarkersModal({
  close,
  streamId,
}: {
  close: () => void;
  streamId: string | undefined;
}) {
  const { HighlighterService } = Services;
  const clips = useVuex(() =>
    HighlighterService.getClips(HighlighterService.views.clips, streamId),
  );
  const sortedClips = [...sortClipsByOrder(clips, streamId)];

  const [markersFormat, setMarkersFormat] = useState('edl');
  const [davinciStartFromHour, setDavinciStartFromHour] = useState(true);

  const availableMarkersFormats = [
    { value: 'edl', label: $t('DaVinci Resolve (EDL)') },
    { value: 'csv', label: $t('CSV') },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
      <h2>{$t('Export Markers')}</h2>
      <p>
        Select the video editing software you want to export markers for.
      </p>
      <Select
        style={{ width: '100%' }}
        value={markersFormat}
        onChange={value => setMarkersFormat(value)}
      >
        {availableMarkersFormats.map(option => (
          <Option key={option.value} value={option.value}>
            {option.label}
          </Option>
        ))}
      </Select>

      {markersFormat === 'edl' && (
        <Checkbox
          checked={davinciStartFromHour}
          onChange={e => setDavinciStartFromHour(e.target.checked)}
          style={{ marginTop: '10px' }}
        >
          {$t('Timeline starts from 01:00:00 (default)')}
        </Checkbox>
      )}

      <Button
        type="primary"
        style={{ marginTop: '20px', width: '100%' }}
        onClick={async () => {
          const { filePath, canceled } = await dialog.showSaveDialog({
            title: $t('Export Markers'),
            defaultPath: `markers.${markersFormat}`,
          });
          close();
        }}
      >
        {$t('Export')}
      </Button>
    </div>
  );
}
