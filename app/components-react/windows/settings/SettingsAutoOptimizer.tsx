import React from 'react';
import { ConnectedAutoOptimizer } from 'components-react/shared/auto-optimizer';
import { Services } from 'components-react/service-provider';

export default function SettingsAutoOptimizer() {
  const service = Services.AutoConfigService;

  return (
    <ConnectedAutoOptimizer
      host="settings"
      onApply={() => void service.actions.return.applyRecommendations()}
      onClose={() => void service.actions.return.dismiss()}
    />
  );
}
