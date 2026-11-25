import React from 'react';
import { ConnectedAutoOptimizer } from 'components-react/shared/auto-optimizer';
import { Services } from 'components-react/service-provider';

export default function SettingsAutoOptimizer() {
  const service = Services.AutoOptimizerService;

  return (
    <ConnectedAutoOptimizer
      host="settings"
      onApply={() => service.actions.applyRecommendations()}
      onClose={() => service.actions.dismiss()}
    />
  );
}
