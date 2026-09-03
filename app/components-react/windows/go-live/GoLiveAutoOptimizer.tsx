import React from 'react';
import { ConnectedAutoOptimizer } from 'components-react/shared/auto-optimizer';
import { Services } from 'components-react/service-provider';
import { useGoLiveSettings } from './useGoLiveSettings';

export default function GoLiveAutoOptimizer() {
  const service = Services.AutoConfigService;
  const { continueGoLiveAfterOptimizer } = useGoLiveSettings();

  const continueAfter = async (action: () => Promise<boolean>) => {
    if (!(await action())) return;
    await continueGoLiveAfterOptimizer();
  };

  return (
    <ConnectedAutoOptimizer
      host="go-live"
      onSkip={() => void continueAfter(() => service.actions.return.skipAndContinue())}
      onApply={() => void continueAfter(() => service.actions.return.applyRecommendations())}
      onContinueWithoutOptimization={() =>
        void continueAfter(() => service.actions.return.continueWithoutOptimization())
      }
      onClose={() => void service.actions.return.dismiss()}
    />
  );
}
