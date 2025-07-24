const fs = require('fs-extra');

type TMeterEvent =
  | 'mainWindowShow'
  | 'sceneCollectionLoad'
  | 'CPU'
  | 'memory'
  | 'renderer-js'
  | 'updater-js'
  | 'addSources'
  | 'removeSources'
  | 'addNodes'
  | 'removeNodes';

const units: { [key in TMeterEvent]: string } = {
  mainWindowShow: 'ms',
  sceneCollectionLoad: 'ms',
  CPU: 'percent',
  memory: 'bite',
  'renderer-js': 'bite',
  'updater-js': 'bite',
  addSources: 'ms',
  removeSources: 'ms',
  addNodes: 'ms',
  removeNodes: 'removeNodes',
};

/**
 * measures time between events
 */
class Meter {
  /**
   * keeps starting time of events
   */
  private pendingEvents: Partial<{ [key in TMeterEvent]: number }>;

  /**
   * keeps durations of events
   */
  private recordedEvents: Partial<{ [key in TMeterEvent]: { units: string; values: number[] } }>;

  constructor() {
    this.reset();
  }

  reset() {
    this.pendingEvents = {};
    this.recordedEvents = {};
  }

  getRecordedEvents() {
    return this.recordedEvents;
  }

  startMeasure(eventName: TMeterEvent) {
    if (this.pendingEvents[eventName]) {
      throw new Error(`Measurement of "${eventName}" has been already started`);
    }
    this.pendingEvents[eventName] = Date.now();
  }

  stopMeasure(eventName: TMeterEvent) {
    const eventStartTime = this.pendingEvents[eventName];

    if (!eventStartTime) {
      throw new Error(
        `Try to stop measure the event "${eventName}" but the measurement has not been started `,
      );
    }

    const duration = Date.now() - eventStartTime;
    delete this.pendingEvents[eventName];
    this.addMeasurement(eventName, duration);
  }

  addMeasurement(eventName: TMeterEvent, duration: number) {
    if (!this.recordedEvents[eventName]) {
      this.recordedEvents[eventName] = { units: units[eventName], values: [] };
    }
    this.recordedEvents[eventName].values.push(duration);
  }

  writeReportToFile(testName: string, path: string) {
    let reportText = `# ${testName}`;
    const { recordedEvents } = this;

    Object.keys(recordedEvents).forEach((eventName: keyof typeof recordedEvents) => {
      const values = recordedEvents[eventName].values;
      const average = values.reduce((v1: number, v2: number) => v1 + v2) / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);
      const dispersion = max - min;
      reportText += `
        ##${eventName}
        records: ${JSON.stringify(values)}
        average: ${average}
        min: ${min}
        max: ${max}
        dispersion: ${dispersion}
      `;
    });
    fs.appendFileSync(path, reportText);
  }
}

let meter: Meter;

/**
 * returns already created instance of Meter if exists or creates a new one
 */
export function getMeter() {
  if (meter) return meter;
  meter = new Meter();
  return meter;
}
