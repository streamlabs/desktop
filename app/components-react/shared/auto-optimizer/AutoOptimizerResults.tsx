import React from 'react';
import { Button } from 'antd';
import { $t } from 'services/i18n';
import { $i } from 'services/utils';
import { cloudRestreamConfidenceExplanationKey } from './presentation';
import { IAutoOptimizerPresentationAdvice, IAutoOptimizerPresentationLeg } from './types';
import styles from './AutoOptimizer.m.less';

function settingsKey(leg: IAutoOptimizerPresentationLeg) {
  return [
    leg.width,
    leg.height,
    leg.additionalVideo?.width || '',
    leg.additionalVideo?.height || '',
    leg.fps,
    leg.bitrateKbps,
    leg.encoder || '',
    leg.preset || '',
    leg.measurementMode,
    leg.estimateReason || '',
    leg.managedByProvider ? 'provider-encoding' : '',
    leg.videoSettingsManagedByProvider ? 'provider-video' : '',
    ...(leg.platforms || []).map(platform => platform.id).sort(),
    ...(leg.measuredPlatforms || []).map(platform => `measured:${platform.id}`).sort(),
    ...(leg.estimatedPlatforms || []).map(platform => `estimated:${platform.id}`).sort(),
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

function MeasurementProvenance(p: { leg: IAutoOptimizerPresentationLeg; standalone?: boolean }) {
  const measured = p.leg.measurementMode === 'active' ? p.leg.measuredPlatforms || [] : [];
  const estimated =
    p.leg.measurementMode === 'active' ? p.leg.estimatedPlatforms || [] : p.leg.platforms || [];
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

function EstimateExplanation(p: { leg: IAutoOptimizerPresentationLeg }) {
  if (!p.leg.estimateReason) return null;
  if (
    p.leg.measurementMode !== 'estimated' &&
    p.leg.measurementConfidence !== 'low' &&
    !p.leg.showMeasurementReason
  ) {
    return null;
  }
  return <p className={styles.estimateExplanation}>{p.leg.estimateReason}</p>;
}

function ActiveMeasurementExplanation(p: { leg: IAutoOptimizerPresentationLeg }) {
  if (p.leg.showMeasurementReason) return null;
  if (p.leg.measurementMode !== 'active' || p.leg.route !== 'cloud-restream') return null;
  const message = cloudRestreamConfidenceExplanationKey(p.leg.measurementConfidence);
  return message ? <p className={styles.estimateExplanation}>{$t(message)}</p> : null;
}

function SettingsList(p: { leg: IAutoOptimizerPresentationLeg }) {
  const { leg } = p;

  return (
    <>
      <ul className={styles.settingsList}>
        {leg.additionalVideo ? (
          <>
            <li>
              <i className="icon-check" aria-hidden="true" />
              {$t('Horizontal canvas resolution')}: {leg.width}×{leg.height}
            </li>
            <li>
              <i className="icon-check" aria-hidden="true" />
              {$t('Vertical canvas resolution')}: {leg.additionalVideo.width}×
              {leg.additionalVideo.height}
            </li>
          </>
        ) : (
          <li>
            <i className="icon-check" aria-hidden="true" />
            {$t(leg.managedByProvider ? 'Canvas resolution' : 'Resolution')}: {leg.width}×
            {leg.height}
          </li>
        )}
        <li>
          <i className="icon-check" aria-hidden="true" />
          {$t('Framerate')}: {leg.fps} {$t('fps')}
        </li>
        {!leg.managedByProvider && (
          <li>
            <i className="icon-check" aria-hidden="true" />
            {$t('Bitrate')}: {leg.bitrateKbps} Kbps
            <MeasurementProvenance leg={leg} />
          </li>
        )}
        {!leg.managedByProvider && leg.encoder && (
          <li>
            <i className="icon-check" aria-hidden="true" />
            {$t('Encoder')}: {leg.encoder}
          </li>
        )}
      </ul>
      {leg.managedByProvider && (
        <div className={styles.providerManaged}>
          <h3>{$t('Twitch Enhanced Broadcasting')}</h3>
          <p>{$t('Twitch will manage stream output resolutions, bitrates, and encoders.')}</p>
          <MeasurementProvenance leg={leg} standalone />
          <EstimateExplanation leg={leg} />
          <ActiveMeasurementExplanation leg={leg} />
        </div>
      )}
      {!leg.managedByProvider && <EstimateExplanation leg={leg} />}
      {!leg.managedByProvider && <ActiveMeasurementExplanation leg={leg} />}
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
  legs: IAutoOptimizerPresentationLeg[];
  advice?: IAutoOptimizerPresentationAdvice | null;
  applying: boolean;
  host: 'go-live' | 'settings' | 'onboarding';
  onApply(): void;
  onSkip(): void;
  onAdvice?(): void;
}) {
  const allSettingsMatch =
    p.legs.length > 0 && p.legs.every(leg => settingsKey(leg) === settingsKey(p.legs[0]));
  const allProviderManaged =
    p.legs.length > 0 &&
    p.legs.every(
      leg => leg.managedByProvider && (leg.videoSettingsManagedByProvider ?? leg.managedByProvider),
    );
  let applyLabel = $t('Save Settings');
  if (p.host === 'go-live') {
    applyLabel = allProviderManaged ? $t('Continue & Go Live') : $t('Save Settings & Go Live');
  }

  return (
    <section className={styles.resultsScreen}>
      <p className={styles.subtitle}>{$t("You're all set!")}</p>
      <div className={styles.summaryCard}>
        <div className={styles.summaryContent}>
          <h2>{$t('Your recommended settings are:')}</h2>
          {allSettingsMatch ? (
            <SettingsList leg={p.legs[0]} />
          ) : (
            <div className={styles.legGrid}>
              {p.legs.map(leg => (
                <div key={leg.legId} className={styles.legSettings}>
                  <h3>{leg.label}</h3>
                  <SettingsList leg={leg} />
                </div>
              ))}
            </div>
          )}
        </div>
        <div className={styles.kevinResultFrame} aria-hidden="true">
          <img
            className={styles.kevinResult}
            src={$i('images/auto-optimizer/kevin-black.png')}
            alt=""
          />
        </div>
      </div>
      {p.advice && <AdviceCard advice={p.advice} onAction={p.onAdvice} />}
      <div className={styles.resultActions}>
        <Button
          className={styles.primaryButton}
          disabled={p.applying || p.legs.length === 0}
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
