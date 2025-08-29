import { getVideoFramerateAndFrameCount } from './cut-highlight-clips';
import { IHighlightedStream } from './models/highlighter.models';

function eventSeverity(eventType: string): number {
  switch (eventType) {
    case 'deploy':
      return 1;
    case 'elimination':
      return 2;
    case 'knockout':
      return 2;
    case 'death':
      return 3;
    case 'victory':
      return 4;
    case 'defeat':
      return 5;
    default:
      return 0; // Unknown event type
  }
}

/**
 * Export provided highlights to an EDL format for DaVinci Resolve.
 *
 * @param [startFromHour=true] - Whether to start the timecode from hour 01:00:00:00. Which is a default timeline
 * setting for DaVinci Resolve.
 */
export async function exportEDL(
  stream: IHighlightedStream,
  exportRange: boolean = false,
  startFromHour: boolean = true,
) {
  function toTimecode(seconds: number, fps: number) {
    let hours = Math.floor(seconds / 3600);
    if (startFromHour) {
      hours = hours + 1;
    }

    const hrs = String(hours).padStart(2, '0');
    const mins = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
    const secs = String(Math.floor(seconds % 60)).padStart(2, '0');
    const frames = String(Math.round((seconds % 1) * fps)).padStart(2, '0');
    return `${hrs}:${mins}:${secs}:${frames}`;
  }

  function mapColor(inputType: string) {
    switch (inputType) {
      case 'deploy':
        return 'ResolveColorBlue';
      case 'elimination':
        return 'ResolveColorGreen';
      case 'knockout':
        return 'ResolveColorGreen';
      case 'death':
        return 'ResolveColorRed';
      case 'victory':
        return 'ResolveColorYellow';
      case 'defeat':
        return 'ResolveColorPurple';
      default:
        return 'ResolveColorBlue';
    }
  }

  const { framerate, totalFrames } = await getVideoFramerateAndFrameCount(stream.path);

  const lines = [];
  lines.push(`TITLE: ${stream.title} Markers`);
  lines.push('FCM: NON-DROP FRAME');
  lines.push('');

  let index = 0;
  if (!stream.highlights) {
    return lines.join('\n');
  }

  stream.highlights.forEach(highlight => {
    // export as marker range if requested
    if (exportRange) {
      const start = toTimecode(highlight.start_time, framerate);
      const end = toTimecode(highlight.end_time, framerate);

      const duration = highlight.end_time - highlight.start_time;
      const durationFrames = Math.round(duration * framerate);

      const mostImportantEvent = highlight.input_types.sort(
        (a, b) => eventSeverity(b) - eventSeverity(a),
      )[0];

      const color = mapColor(mostImportantEvent);

      // eslint-disable-next-line prettier/prettier
      lines.push(`${String(index + 1).padStart(3, '0')}  001      V     C        ${start} ${end} ${start} ${end}`);
      lines.push(` |C:${color} |M:${highlight.input_types.join(' ')} |D:${durationFrames}`);
      lines.push('');
    } else {
      // process each input separately
      highlight.inputs.forEach(input => {
        const start = toTimecode(input.start_time, framerate);
        const end = input.end_time
          ? toTimecode(input.end_time, framerate)
          : start
              .split(':')
              .map((v, i) => (i === 3 ? String(Number(v) + 1).padStart(2, '0') : v))
              .join(':');

        const durationFrames = 1;

        const color = mapColor(input.type);

        // eslint-disable-next-line prettier/prettier
        lines.push(`${String(index + 1).padStart(3, '0')}  001      V     C        ${start} ${end} ${start} ${end}`);
        lines.push(` |C:${color} |M:${input.type} |D:${durationFrames}`);
        lines.push('');
      });
    }

    index++;
  });
  return lines.join('\n');
}

export async function exportCSV(
  stream: IHighlightedStream,
  exportRange: boolean = false,
  startFromHour: boolean = false,
) {
  function toTimecode(seconds: number, startFromHour: boolean = false) {
    let hours = Math.floor(seconds / 3600);
    if (startFromHour) {
      hours = hours + 1;
    }

    const hrs = String(hours).padStart(2, '0');
    const mins = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
    const secs = String(Math.floor(seconds % 60)).padStart(2, '0');
    return `${hrs}:${mins}:${secs}:00`;
  }

  function mapColor(inputType: string) {
    switch (inputType) {
      case 'deploy':
        return 'Blue';
      case 'elimination':
        return 'Green';
      case 'knockout':
        return 'Green';
      case 'death':
        return 'Red';
      case 'victory':
        return 'Yellow';
      case 'defeat':
        return 'Purple';
      default:
        return 'Blue';
    }
  }

  const { framerate, totalFrames } = await getVideoFramerateAndFrameCount(stream.path);

  const csvRows = [
    [
      'No.',
      'Timecode In',
      'Timecode Out',
      'Duration',
      'Frame In',
      'Frame Out',
      'Length',
      'Name',
      'Comment',
      'User',
      'Note',
      'Color',
      'Track',
      'Clip Name',
      'Source',
      'Source Start',
      'Source End',
    ],
  ];

  let index = 1;
  if (!stream.highlights) {
    return csvRows.map(row => row.join(',')).join('\n');
  }

  stream.highlights.forEach(highlight => {
    // export as marker range if requested
    if (exportRange) {
      const start = toTimecode(highlight.start_time, startFromHour);
      const end = toTimecode(highlight.end_time, startFromHour);

      const duration = highlight.end_time - highlight.start_time;
      const durationTimecode = toTimecode(duration);

      const frameIn = Math.round(highlight.start_time * framerate);
      const frameOut = Math.round(highlight.end_time * framerate);
      const length = Math.round(duration * framerate);

      const mostImportantEvent = highlight.input_types.sort(
        (a, b) => eventSeverity(b) - eventSeverity(a),
      )[0];

      const color = mapColor(mostImportantEvent);

      csvRows.push([
        `${index}.`,
        start,
        end,
        durationTimecode,
        `${frameIn}`,
        `${frameOut}`,
        `${length}`,
        highlight.input_types.join(' '),
        '',
        '',
        '',
        color,
        'V1',
        '',
        '',
        '',
        '',
      ]);
    } else {
      // process each input separately
      highlight.inputs.forEach(input => {
        const start = toTimecode(input.start_time, startFromHour);
        const end = input.end_time
          ? toTimecode(input.end_time, startFromHour)
          : start
              .split(':')
              .map((v, i) => (i === 3 ? String(Number(v) + 1).padStart(2, '0') : v))
              .join(':');

        const durationFrames = 1;
        const durationTimecode = '00:00:00:01';

        const frameIn = Math.round(input.start_time * framerate);
        const frameOut = frameIn + durationFrames;
        const length = durationFrames;

        const color = mapColor(input.type);

        csvRows.push([
          `${index}.`,
          start,
          end,
          durationTimecode,
          `${frameIn}`,
          `${frameOut}`,
          `${length}`,
          highlight.input_types.join(' '),
          '',
          '',
          '',
          color,
          'V1',
          '',
          '',
          '',
          '',
        ]);
      });
    }

    index++;
  });

  return csvRows.map(row => row.join(',')).join('\n');
}

export async function exportYouTubeChapters(stream: IHighlightedStream) {
  function toTimecode(seconds: number) {
    const hours = Math.floor(seconds / 3600);
    const hrs = String(hours).padStart(2, '0');
    const mins = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
    const secs = String(Math.floor(seconds % 60)).padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
  }

  const lines: string[] = [];
  if (!stream.highlights) {
    return '';
  }

  stream.highlights.forEach(highlight => {
    const start = toTimecode(highlight.start_time);

    const events = highlight.input_types
      .map(inputType => {
        return inputType.charAt(0).toUpperCase() + inputType.slice(1);
      })
      .map(inputType => inputType.replace(/_/g, ' '))
      .join(', ');

    lines.push(`${start} ${events}`);
  });

  return lines.join('\n');
}
