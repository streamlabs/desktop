import { useModule } from 'slap';
import { Services } from 'components-react/service-provider';
import AutoProgressBar from 'components-react/shared/AutoProgressBar';
import React, { useState } from 'react';
import { IConfigProgress } from 'services/auto-config';
import { $t } from 'services/i18n';
import commonStyles from './Common.m.less';
import { OnboardingModule } from './Onboarding';

interface IConfigStepPresentation {
  description: string;
  summary: string;
  percentage?: number;
}

export function Optimize() {
  const { AutoConfigService, RecordingModeService } = Services;
  const [optimizingState, setOptimizingState] = useState<'initial' | 'running' | 'error'>('initial');
  const [stepInfo, setStepInfo] = useState<IConfigStepPresentation | null>(null);
  const steps = [
    'detecting_location',
    'location_found',
    'bandwidth_test',
    'streamingEncoder_test',
    'recordingEncoder_test',
    'checking_settings',
    'setting_default_settings',
    'saving_service',
    'saving_settings',
  ];
  const percentage =
    optimizingState === 'running' && stepInfo ? (steps.indexOf(stepInfo.description) + 1) / steps.length : 0;
  const { setProcessing, next } = useModule(OnboardingModule);

  function summaryForStep(progress: IConfigProgress) {
    return {
      detecting_location: $t('Detecting your location...'),
      location_found: $t('Detected %{continent}', { continent: progress.continent }),
      bandwidth_test: $t('Performing bandwidth test...'),
      streamingEncoder_test: $t('Testing streaming encoder...'),
      recordingEncoder_test: $t('Testing recording encoder...'),
      checking_settings: $t('Attempting stream...'),
      setting_default_settings: $t('Reverting to defaults...'),
      saving_service: $t('Applying stream settings...'),
      saving_settings: $t('Applying general settings...'),
    }[progress.description];
  }

  function optimize() {
    setOptimizingState('running');
    setProcessing(true);

    const sub = AutoConfigService.configProgress.subscribe(progress => {
      if (
        progress.event === 'starting_step' ||
        progress.event === 'progress' ||
        progress.event === 'stopping_step'
      ) {
        if (stepInfo && stepInfo.description === progress.description) {
          stepInfo.percentage = progress.percentage;
        } else {
          setStepInfo({
            description: progress.description,
            summary: summaryForStep(progress)!,
            percentage: progress.percentage,
          });
        }
      } else if (progress.event === 'done') {
        setProcessing(false);
        sub.unsubscribe();
        next();
      } else {
        console.error("AutoConfigService error:", progress.description);
        setProcessing(false);
        sub.unsubscribe();
        setOptimizingState('error');
      }
    });

    RecordingModeService.views.isRecordingModeEnabled
      ? AutoConfigService.actions.startRecording()
      : AutoConfigService.actions.start();
  }

  function closeOnError() {
    next();
  }

  return (
    <div>
      <h1 className={commonStyles.titleContainer}>
        {optimizingState === 'running' ? $t('Optimizing...') : (optimizingState === 'initial' ? $t('Optimize') : $t('Error'))}
      </h1>
      {(optimizingState === 'initial' || optimizingState === 'error') && (
        <div style={{ width: '60%', margin: 'auto', textAlign: 'center' }}>
          {optimizingState === 'initial' ? $t(
            "Click below and we'll analyze your internet speed and computer hardware to give you the best settings possible.",
          ): $t(
            "An error has occurred during optimization attempt. Only default settings are applied",
          )}
        </div>
      )}
      {optimizingState === 'running' ? (
        <div style={{ margin: 'auto', marginTop: 24, width: '80%' }}>
          <AutoProgressBar percent={percentage * 100} timeTarget={1000 * 60} />
          <span>{stepInfo && stepInfo.summary}</span>
        </div>
      ) : (
        <button
          className={commonStyles.optionCard}
          onClick={() => optimizingState === 'initial' ? optimize() : closeOnError()}
          style={{ margin: 'auto', marginTop: 24 }}
        >
          <h2 style={{ color: 'var(--action-button-text)' }}>{optimizingState === 'initial' ? $t('Start') : $t('Ok')}</h2>
        </button>
      )}
    </div>
  );
}
