import React, { useEffect, useRef, useState } from 'react';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import { useVuex } from 'components-react/hooks';
import { Button, Select, Checkbox } from 'antd';
import { dialog } from '@electron/remote';
import {
  exportCSV,
  exportEDL,
  exportYouTubeChapters,
} from 'services/highlighter/markers-exporters';
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
  // many professional video editors require the timeline to start from 01:00:00:00, so we default to true
  const [startFromHour, setStartFromHour] = useState(true);
  const [exportRanges, setExportRanges] = useState(false);
  const [exporting, setExporting] = useState(false);

  const availableMarkersFormats = [
    { value: 'edl', label: $t('DaVinci Resolve (EDL)') },
    { value: 'csv', label: $t('CSV') },
    { value: 'youtube', label: $t('YouTube Chapter Markers (for recording)') },
  ];

  const exportMarkers = async () => {
    if (stream.highlights?.length === 0) {
      return;
    }
    setExporting(true);

    try {
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: $t('Export Markers'),
        defaultPath: `${stream.title} - Markers.${
          markersFormat === 'youtube' ? 'txt' : markersFormat
        }`,
      });
      if (canceled || !filePath) {
        return;
      }

      let content = '';
      if (markersFormat === 'csv') {
        content = await exportCSV(stream, exportRanges, startFromHour);
      } else if (markersFormat === 'edl') {
        content = await exportEDL(stream, exportRanges, startFromHour);
      } else if (markersFormat === 'youtube') {
        content = await exportYouTubeChapters(stream);
      }

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
      {markersFormat !== 'youtube' && (
        <Checkbox
          checked={startFromHour}
          onChange={e => setStartFromHour(e.target.checked)}
          style={{ marginTop: '10px' }}
        >
          {$t('Timeline starts from 01:00:00 (default)')}
        </Checkbox>
      )}

      {markersFormat !== 'youtube' && (
        <Checkbox
          checked={exportRanges}
          onChange={e => setExportRanges(e.target.checked)}
          style={{ marginTop: '6px', marginLeft: '0px' }}
        >
          {$t('Export full highlight duration as marker range')}
        </Checkbox>
      )}

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
