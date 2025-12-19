import { PersistentStatefulService, mutation } from 'services/core';

interface ITwitchContentClassificationState {
  contentClassification: string | null;
  contentClassificationOptions: Dictionary<ITwitchContentClassificationMap>;
  labelsLoaded: boolean;
}

interface ITwitchContentClassificationMap {
  id: string;
  name: string;
  description: string;
}

export interface ITwitchContentClassificationLabelsRootResponse {
  data: ITwitchContentClassificationLabelResponse[];
}

interface ITwitchContentClassificationLabelResponse {
  id: string;
  name: string;
  description: string;
}

export class TwitchContentClassificationService extends PersistentStatefulService<ITwitchContentClassificationState> {
  static defaultState: ITwitchContentClassificationState = {
    contentClassification: null,
    contentClassificationOptions: {},
    labelsLoaded: false,
  };

  load() {
    this.SET_LABELS_LOADED(true);
  }

  setLabels(labels: ITwitchContentClassificationLabelsRootResponse) {
    const labelsMap = labels.data.reduce((acc, label) => {
      // Twitch doesn't let your explicity set "Mature Game" from their UI, so we're filtering that out
      if (label.id === 'MatureGame') {
        return acc;
      }

      acc[label.id] = { id: label.id, name: label.name, description: label.description };
      return acc;
    }, {} as ITwitchContentClassificationState['contentClassificationOptions']);

    this.SET_LABELS(labelsMap);
    this.SET_LABELS_LOADED(true);
  }

  get areLabelsLoaded() {
    return this.state.labelsLoaded;
  }

  get labels() {
    return this.state.contentClassificationOptions;
  }

  get options() {
    return Object.values(this.state.contentClassificationOptions).map(label => ({
      value: label.id,
      label: label.name,
    }));
  }

  @mutation()
  SET_LABELS(labels: ITwitchContentClassificationState['contentClassificationOptions']) {
    this.state.contentClassificationOptions = labels;
  }

  @mutation()
  SET_LABELS_LOADED(loaded: boolean) {
    this.state.labelsLoaded = loaded;
  }
}
