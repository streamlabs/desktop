import React, { useEffect, useRef, useState } from 'react';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import { useVuex } from 'components-react/hooks';
import { Button, Select, Checkbox } from 'antd';
import { dialog } from '@electron/remote';
import { exportEDL } from 'services/highlighter/markers-exporters';
import { promises as fs } from 'fs';
const { Option } = Select;

export default function ExportMarkersModal({
  close,
  streamId,
}: {
  close: () => void;
  streamId: string;
}) {
  const { HighlighterService } = Services;
  const stream = useVuex(() => HighlighterService.views.highlightedStreamsDictionary[streamId]);

  const [markersFormat, setMarkersFormat] = useState('edl');
  const [davinciStartFromHour, setDavinciStartFromHour] = useState(true);
  const [exportRanges, setExportRanges] = useState(false);
  const [exporting, setExporting] = useState(false);

  const availableMarkersFormats = [
    { value: 'edl', label: $t('DaVinci Resolve (EDL)') },
    { value: 'csv', label: $t('CSV') },
  ];

  const exportMarkers = async () => {
    if (stream.highlights?.length === 0) {
      return;
    }
    setExporting(true);

    try {
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: $t('Export Markers'),
        defaultPath: `markers.${markersFormat}`,
      });
      if (canceled || !filePath) {
        return;
      }

      const content = await exportEDL(stream, exportRanges, davinciStartFromHour);
      await fs.writeFile(filePath, content, 'utf-8');
      close();
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
      <h2>{$t('Export Markers')}</h2>
      <p>Select the video editing software you want to export markers for.</p>
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

      <Checkbox
        checked={exportRanges}
        onChange={e => setExportRanges(e.target.checked)}
        style={{ marginTop: '10px' }}
      >
        {$t('Export full highlight duration as marker range')}
      </Checkbox>

      <Button
        type="primary"
        style={{ marginTop: '20px', width: '100%' }}
        loading={exporting}
        onClick={exportMarkers}
      >
        {$t('Export')}
      </Button>
    </div>
  );
}
