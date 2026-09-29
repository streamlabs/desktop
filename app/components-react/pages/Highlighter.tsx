import SettingsView from 'components-react/highlighter/SettingsView';
import React, { useEffect, useState } from 'react';
import { EHighlighterView, IViewState } from 'services/highlighter/models/highlighter.models';
import { Services } from 'components-react/service-provider';
import StreamView from 'components-react/highlighter/StreamView';
import ClipsView from 'components-react/highlighter/ClipsView';

export default function Highlighter(props: { params?: { view: string } }) {
  const { HighlighterService, UsageStatisticsService } = Services;

  const clipsAmount = HighlighterService.views.clips.length;

  let initialViewState: IViewState;

  if (props.params?.view) {
    const view =
      props.params?.view === 'settings' ? EHighlighterView.SETTINGS : EHighlighterView.STREAM;
    initialViewState = { view };
  } else if (clipsAmount > 0) {
    initialViewState = { view: EHighlighterView.CLIPS };
  } else {
    initialViewState = { view: EHighlighterView.STREAM };
  }

  const [viewState, setViewState] = useState<IViewState>(initialViewState);

  useEffect(() => {
    UsageStatisticsService.recordShown('HighlighterTab', viewState.view);
  }, [viewState]);

  switch (viewState.view) {
    case EHighlighterView.STREAM:
      return <StreamView emitSetView={data => setViewState(data)} />;
    case EHighlighterView.CLIPS:
      return <ClipsView emitSetView={data => setViewState(data)} />;
    default:
      return (
        <SettingsView
          close={() => {
            HighlighterService.actions.dismissTutorial();
          }}
          emitSetView={data => setViewState(data)}
        />
      );
  }
}
