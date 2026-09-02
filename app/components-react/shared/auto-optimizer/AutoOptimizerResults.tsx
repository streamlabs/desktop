import React from 'react';
import { Button } from 'antd';
import { $t } from 'services/i18n';
import { $i } from 'services/utils';
import { IAutoOptimizerPresentationAdvice, IAutoOptimizerPresentationOutput } from './types';
import styles from './AutoOptimizer.m.less';

function settingsKey(output: IAutoOptimizerPresentationOutput) {
  return [
    output.width,
    output.height,
    output.additionalVideo?.width || '',
    output.additionalVideo?.height || '',
    output.fps,
    output.bitrateKbps,
    output.encoder || '',
    output.preset || '',
    output.measurementMode,
    output.estimateReason || '',
    output.managedByProvider ? 'provider-encoding' : '',
    output.videoSettingsManagedByProvider ? 'provider-video' : '',
    ...(output.platforms || []).map(platform => platform.id).sort(),
    ...(output.measuredPlatforms || []).map(platform => `measured:${platform.id}`).sort(),
    ...(output.estimatedPlatforms || []).map(platform => `estimated:${platform.id}`).sort(),
  ].join(':');
}

function PlatformChips(p: { platforms: Array<{ id: string; label: string }> }) {
  return (
    <>
      {p.platforms.map((platform, index) => (
        <React.Fragment key={platform.id}>
          {index > 0 && <span className={styles.platformJoin}>+</span>}
          <span
            className={`${styles.platformChip} ${
              styles[`platform-chip--${platform.id}`] || styles.platformChipFallback
            }`}
          >
            {platform.label}
          </span>
        </React.Fragment>
      ))}
    </>
  );
}

function MeasurementProvenance(p: {
  output: IAutoOptimizerPresentationOutput;
  standalone?: boolean;
}) {
  const measured = p.output.measurementMode === 'active' ? p.output.measuredPlatforms || [] : [];
  // `platforms` includes every destination that shares this output. Show
  // measurement details only for Twitch and YouTube, the providers Auto
  // Optimizer can test. Using the full destination list would incorrectly claim
  // that destinations such as Kick were tested or estimated.
  const estimated = p.output.estimatedPlatforms || [];
  if (!measured.length && !estimated.length) return null;

  const contents = (
    <>
      {measured.length > 0 && (
        <>
          {$t('Measured on')} <PlatformChips platforms={measured} />
        </>
      )}
      {measured.length > 0 && estimated.length > 0 && '; '}
      {estimated.length > 0 && (
        <>
          {$t('Estimated for')} <PlatformChips platforms={estimated} />
        </>
      )}
    </>
  );

  if (p.standalone) {
    return <span className={styles.measurementBlock}>{contents}</span>;
  }

  return (
    <span className={styles.measurementInline}>
      {' ('}
      {contents}
      {')'}
    </span>
  );
}

function EstimateExplanation(p: { output: IAutoOptimizerPresentationOutput }) {
  if (!p.output.estimateReason) return null;
  if (
    p.output.measurementMode !== 'estimated' &&
    p.output.measurementConfidence !== 'low' &&
    !p.output.showMeasurementReason
  ) {
    return null;
  }
  return <p className={styles.estimateExplanation}>{p.output.estimateReason}</p>;
}

function SettingsList(p: {
  output: IAutoOptimizerPresentationOutput;
  standaloneMeasurement?: boolean;
}) {
  const { output } = p;

  return (
    <>
      <ul className={styles.settingsList}>
        {output.additionalVideo ? (
          <>
            <li>
              <i className="icon-check" aria-hidden="true" />
              {$t('Horizontal canvas resolution')}: {output.width}×{output.height}
            </li>
            <li>
              <i className="icon-check" aria-hidden="true" />
              {$t('Vertical canvas resolution')}: {output.additionalVideo.width}×
              {output.additionalVideo.height}
            </li>
          </>
        ) : (
          <li>
            <i className="icon-check" aria-hidden="true" />
            {$t(output.managedByProvider ? 'Canvas resolution' : 'Resolution')}: {output.width}×
            {output.height}
          </li>
        )}
        <li>
          <i className="icon-check" aria-hidden="true" />
          {$t('Framerate')}: {output.fps} {$t('fps')}
        </li>
        {!output.managedByProvider && (
          <li className={p.standaloneMeasurement ? styles.settingWithMeasurement : undefined}>
            <i className="icon-check" aria-hidden="true" />
            {$t('Bitrate')}: {output.bitrateKbps} Kbps
            <MeasurementProvenance output={output} standalone={p.standaloneMeasurement} />
          </li>
        )}
        {!output.managedByProvider && output.encoder && (
          <li>
            <i className="icon-check" aria-hidden="true" />
            {$t('Encoder')}: {output.encoder}
          </li>
        )}
      </ul>
      {output.managedByProvider && (
        <div className={styles.providerManaged}>
          <h3>{$t('Twitch Enhanced Broadcasting')}</h3>
          <p>{$t('Twitch will manage stream output resolutions, bitrates, and encoders.')}</p>
          <MeasurementProvenance output={output} standalone />
          <EstimateExplanation output={output} />
        </div>
      )}
      {!output.managedByProvider && <EstimateExplanation output={output} />}
    </>
  );
}

function AdviceCard(p: { advice: IAutoOptimizerPresentationAdvice; onAction?(): void }) {
  return (
    <aside className={styles.adviceCard}>
      <h3>
        <i className="icon-ideas" aria-hidden="true" /> {$t(p.advice.title)}
      </h3>
      <p>{$t(p.advice.description)}</p>
      {p.onAction && (
        <button type="button" className={styles.adviceAction} onClick={p.onAction}>
          <i className="icon-pop-out-2" aria-hidden="true" /> {$t(p.advice.actionLabel)}
        </button>
      )}
    </aside>
  );
}

export function AutoOptimizerResults(p: {
  outputs: IAutoOptimizerPresentationOutput[];
  advice?: IAutoOptimizerPresentationAdvice | null;
  applying: boolean;
  host: 'go-live' | 'settings' | 'onboarding';
  onApply(): void;
  onSkip(): void;
  onAdvice?(): void;
}) {
  const allSettingsMatch =
    p.outputs.length > 0 &&
    p.outputs.every(output => settingsKey(output) === settingsKey(p.outputs[0]));
  const allProviderManaged =
    p.outputs.length > 0 &&
    p.outputs.every(
      output =>
        output.managedByProvider &&
        (output.videoSettingsManagedByProvider ?? output.managedByProvider),
    );
  const splitOutputLayout = !allSettingsMatch;
  const denseOutputLayout = p.outputs.length > 2;
  let applyLabel = $t('Save Settings');
  if (p.host === 'go-live') {
    applyLabel = allProviderManaged ? $t('Continue & Go Live') : $t('Save Settings & Go Live');
  }

  return (
    <section className={styles.resultsScreen}>
      <p className={styles.subtitle}>{$t("You're all set!")}</p>
      <div
        className={`${styles.summaryCard} ${splitOutputLayout ? styles.splitSummaryCard : ''} ${
          denseOutputLayout ? styles.denseSummaryCard : ''
        }`}
      >
        <div className={styles.summaryContent}>
          <h2>{$t('Your recommended settings are:')}</h2>
          {allSettingsMatch ? (
            <SettingsList output={p.outputs[0]} />
          ) : (
            <div className={styles.outputGrid}>
              {p.outputs.map(output => (
                <div key={output.outputId} className={styles.outputSettings}>
                  <h3>{output.label}</h3>
                  <SettingsList output={output} standaloneMeasurement />
                </div>
              ))}
            </div>
          )}
        </div>
        {!denseOutputLayout && (
          <div className={styles.kevinResultFrame} aria-hidden="true">
            <img
              className={styles.kevinResult}
              src={$i('images/auto-optimizer/kevin-black.png')}
              alt=""
            />
          </div>
        )}
      </div>
      {p.advice && <AdviceCard advice={p.advice} onAction={p.onAdvice} />}
      <div className={styles.resultActions}>
        <Button
          className={styles.primaryButton}
          disabled={p.applying || p.outputs.length === 0}
          onClick={p.onApply}
        >
          {p.applying ? $t('Saving Settings...') : applyLabel}
        </Button>
        {p.host === 'go-live' && (
          <button
            type="button"
            className={styles.textButton}
            disabled={p.applying}
            onClick={p.onSkip}
          >
            {$t('Skip')}
          </button>
        )}
      </div>
    </section>
  );
}
