import SettingsView from 'components-react/highlighter/SettingsView';
import { useVuex } from 'components-react/hooks';
import React, { useEffect, useState } from 'react';
import { EHighlighterView, IViewState } from 'services/highlighter/models/highlighter.models';
import { Services } from 'components-react/service-provider';
import StreamView from 'components-react/highlighter/StreamView';
import ClipsView from 'components-react/highlighter/ClipsView';
import UpdateModal from 'components-react/highlighter/UpdateModal';
import { EAvailableFeatures } from 'services/incremental-rollout';

export default function Highlighter(props: { params?: { view: string } }) {
  const { HighlighterService, IncrementalRolloutService, UsageStatisticsService } = Services;
  const aiHighlighterFeatureEnabled = IncrementalRolloutService.views.featureIsEnabled(
    EAvailableFeatures.aiHighlighter,
  );
  const v = useVuex(() => ({
    useAiHighlighter: HighlighterService.views.useAiHighlighter,
    isUpdaterRunning: HighlighterService.views.isUpdaterRunning,
    highlighterVersion: HighlighterService.views.highlighterVersion,
    progress: HighlighterService.views.updaterProgress,
    clipsAmount: HighlighterService.views.clips.length,
    streamAmount: HighlighterService.views.highlightedStreams.length,
  }));

  let initialViewState: IViewState;

  if (props.params?.view) {
    const view =
      props.params?.view === 'settings' ? EHighlighterView.SETTINGS : EHighlighterView.STREAM;
    initialViewState = { view };
  } else if (v.streamAmount > 0 && v.clipsAmount > 0 && aiHighlighterFeatureEnabled) {
    initialViewState = { view: EHighlighterView.STREAM };
  } else if (v.clipsAmount > 0) {
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

  const updaterModal = (
    <UpdateModal
      version={v.highlighterVersion}
      progress={v.progress}
      isVisible={v.isUpdaterRunning}
    />
  );

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
              streamTitle: HighlighterService.views.highlightedStreams.find(
                s => s.id === viewState.id,
              )?.title,
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
