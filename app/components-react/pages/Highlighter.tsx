import SettingsView from 'components-react/highlighter/SettingsView';
import { useVuex } from 'components-react/hooks';
import React, { useEffect, useState } from 'react';
import {
  EHighlighterView,
  IStreamInfoForAiHighlighter,
  IViewState,
  TOpenedFrom,
} from 'services/highlighter/models/highlighter.models';
import { Services } from 'components-react/service-provider';
import StreamView from 'components-react/highlighter/StreamView';
import ClipsView from 'components-react/highlighter/ClipsView';
import UpdateModal from 'components-react/highlighter/UpdateModal';
import { EAvailableFeatures } from 'services/incremental-rollout';
import Utils from 'services/utils';

<<<<<<< HEAD
export default function Highlighter(props: { params?: { view: string; id?: string } }) {
  const {
    HighlighterService,
    IncrementalRolloutService,
    UsageStatisticsService,
    RealtimeHighlighterService,
  } = Services;
  const aiHighlighterFeatureEnabled = IncrementalRolloutService.views.featureIsEnabled(
    EAvailableFeatures.aiHighlighter,
  );
=======
export default function Highlighter(props: { params?: { view: string } }) {
  const { HighlighterService, UsageStatisticsService } = Services;
  const aiHighlighterFeatureEnabled = HighlighterService.aiHighlighterFeatureEnabled;

>>>>>>> master
  const v = useVuex(() => ({
    useAiHighlighter: HighlighterService.views.useAiHighlighter,
  }));

  const clipsAmount = HighlighterService.views.clips.length;
  const streamAmount = HighlighterService.views.highlightedStreams.length;

  let initialViewState: IViewState;

  if (props.params?.view) {
    switch (props.params?.view) {
      case EHighlighterView.SETTINGS:
        initialViewState = { view: EHighlighterView.SETTINGS };
        break;

      case EHighlighterView.STREAM:
        initialViewState = { view: EHighlighterView.STREAM };
        break;

      case EHighlighterView.CLIPS:
        initialViewState = { view: EHighlighterView.CLIPS, id: props.params.id };
        break;

      default:
        initialViewState = { view: EHighlighterView.SETTINGS };
        break;
    }
  } else if (streamAmount > 0 && clipsAmount > 0 && aiHighlighterFeatureEnabled) {
    initialViewState = { view: EHighlighterView.STREAM };
  } else if (clipsAmount > 0) {
    initialViewState = { view: EHighlighterView.CLIPS, id: undefined };
  } else {
    initialViewState = { view: EHighlighterView.SETTINGS };
  }

  useEffect(() => {
    // check if ai highlighter is activated and we need to update it
    async function shouldUpdate() {
      if (!HighlighterService.aiHighlighterUpdater) return false;
      const versionAvailable = await HighlighterService.aiHighlighterUpdater.isNewVersionAvailable();
      return versionAvailable && aiHighlighterFeatureEnabled && v.useAiHighlighter;
    }

    shouldUpdate().then(shouldUpdate => {
      if (shouldUpdate) HighlighterService.actions.startUpdater();
    });
  }, []);

  const [viewState, setViewState] = useState<IViewState>(initialViewState);

  useEffect(() => {
    UsageStatisticsService.recordShown('HighlighterTab', viewState.view);
  }, [viewState]);

  const updaterModal = <UpdateModal />;

  switch (viewState.view) {
    case EHighlighterView.STREAM:
      return (
        <>
          {aiHighlighterFeatureEnabled && updaterModal}
          <StreamView
            emitSetView={data => {
              setViewFromEmit(data);
            }}
          />
        </>
      );
    case EHighlighterView.CLIPS:
      return (
        <>
          {aiHighlighterFeatureEnabled && updaterModal}
          <ClipsView
            emitSetView={data => {
              setViewFromEmit(data);
            }}
            props={{
              id: viewState.id,
              streamTitle: viewState.id
                ? HighlighterService.views.highlightedStreamsDictionary[viewState.id]?.title
                : '',
            }}
          />
        </>
      );
    default:
      return (
        <>
          {aiHighlighterFeatureEnabled && updaterModal}
          <SettingsView
            close={() => {
              HighlighterService.actions.dismissTutorial();
            }}
            emitSetView={data => setViewFromEmit(data)}
          />
        </>
      );
  }

  function setViewFromEmit(data: IViewState) {
    if (data.view === EHighlighterView.CLIPS) {
      setView({
        view: data.view,
        id: data.id,
      });
    } else {
      setView({
        view: data.view,
      });
    }
  }

  function setView(view: IViewState) {
    setViewState(view);
  }
}
