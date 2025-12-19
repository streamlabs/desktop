import fs from 'fs';
import path from 'path';
import moment from 'moment';
import { Inject, mutation, PersistentStatefulService, ViewHandler } from 'services/core';
import { UsageStatisticsService } from './usage-statistics';
import { $t } from './i18n';
import { StreamingService } from './streaming';
import { ENotificationType, NotificationsService } from './notifications';

interface IMarkersServiceState {
  MARKER_1: string;
  MARKER_2: string;
  MARKER_3: string;
  MARKER_4: string;
}

class MarkersServiceViews extends ViewHandler<IMarkersServiceState> {
  getLabel(id: string) {
    if (!this.state) return id;
    // TODO: index
    // @ts-ignore
    return this.state[id];
  }
}

export class MarkersService extends PersistentStatefulService<IMarkersServiceState> {
  @Inject() private streamingService: StreamingService;
  @Inject() private notificationsService: NotificationsService;
  @Inject() private usageStatisticsService: UsageStatisticsService;

  static defaultState: IMarkersServiceState = {
    MARKER_1: 'Marker 1',
    MARKER_2: 'Marker 2',
    MARKER_3: 'Marker 3',
    MARKER_4: 'Marker 4',
  };

  markers: Dictionary<string> = {};

  get views() {
    return new MarkersServiceViews(this.state);
  }

  get hasMarkers() {
    return Object.keys(this.markers).length > 0;
  }

  addMarker(id: string) {
    if (!this.streamingService.views.isRecording) return;
    const label = this.views.getLabel(id);
    const timestamp = this.streamingService.formattedDurationInCurrentRecordingState;
    this.markers[timestamp] = label;

    this.notificationsService.push({
      type: ENotificationType.SUCCESS,
      message: $t('Marker %{label} added at %{timestamp}', { label, timestamp }),
      lifeTime: 1000,
    });

    this.usageStatisticsService.recordFeatureUsage('Markers');
  }

  get tableHeader() {
    return 'No,Timecode In,Timecode Out,Timecode Length,Frame In,Frame Out,Frame Length,Name,Comment,Color,\n';
  }

  get tableContents() {
    const markers = Object.keys(this.markers).sort((a, b) => (a < b ? -1 : 0));
    return markers.map((marker, i) => this.prepareRow(marker, i + 1)).join('\n');
  }

  prepareRow(timestamp: string, number: number) {
    const label = this.markers[timestamp];
    return `${number},${timestamp}:00,${timestamp}:01,,,,0,"","${label}",blue,`;
  }

  async exportCsv(filename: string) {
    if (!this.hasMarkers) return;
    const parsedFilename = path.parse(filename);
    const directory = path.join(parsedFilename.dir, parsedFilename.name);
    const content = this.tableHeader + this.tableContents;
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const fileBuffer = Buffer.from(await blob.arrayBuffer());
    fs.writeFile(`${directory}_markers.csv`, fileBuffer, () => {
      this.markers = {};
    });
  }

  parseCSV(filepath: string) {
    const bookmarksArray: { text: string; starts_at: number }[] = [];
    return new Promise((resolve, reject) => {
      const stream = fs.createReadStream(filepath, 'utf8');
      stream.on('data', (data: string) => {
        data.split('\n').forEach(row => {
          if (/Timecode In,Timecode Out/.test(row)) return;
          const els = row.split(',');
          const timestampArr: string[] = els[1].split(':');
          timestampArr.pop(); // The last element is always 0 hundredths of a second
          const ms = moment.duration(timestampArr.join(':')).asMilliseconds();
          bookmarksArray.push({
            text: els[8],
            starts_at: ms,
          });
        });
      });
      stream.on('error', err => reject(err));
      stream.on('close', () => resolve(bookmarksArray));
    });
  }

  setMarkerName(marker: string, value: string) {
    this.SET_MARKER_NAME(marker, value);
  }

  @mutation()
  private SET_MARKER_NAME(marker: string, value: string) {
    // TODO: index
    // @ts-ignore
    this.state[marker] = value;
  }
}
