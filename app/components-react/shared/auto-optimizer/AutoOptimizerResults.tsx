import React from 'react';
import { Button } from 'antd';
import { $t } from 'services/i18n';
import { $i } from 'services/utils';
import { IAutoOptimizerPresentationAdvice, IAutoOptimizerPresentationLeg } from './types';
import styles from './AutoOptimizer.m.less';

function settingsKey(leg: IAutoOptimizerPresentationLeg) {
  return [
    leg.width,
    leg.height,
    leg.fps,
    leg.bitrateKbps,
    leg.encoder || '',
    leg.preset || '',
    leg.measurementMode,
    leg.estimateReason || '',
    ...(leg.platforms || []).map(platform => platform.id).sort(),
  ].join(':');
}

function MeasurementProvenance(p: { leg: IAutoOptimizerPresentationLeg }) {
  const platforms =
    p.leg.measurementMode === 'active' && p.leg.measuredPlatforms?.length
      ? p.leg.measuredPlatforms
      : p.leg.platforms;
  if (!platforms?.length) return null;

  const label = p.leg.measurementMode === 'active' ? $t('Measured on') : $t('Estimated for');
  return (
    <span className={styles.measurementInline}>
      {' '}
      ({label}{' '}
      {platforms.map((platform, index) => (
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
      )
    </span>
  );
}

function EstimateExplanation(p: { leg: IAutoOptimizerPresentationLeg }) {
  if (!p.leg.estimateReason) return null;
  if (p.leg.measurementMode !== 'estimated' && p.leg.measurementConfidence !== 'low') return null;
  return <p className={styles.estimateExplanation}>{p.leg.estimateReason}</p>;
}

function ActiveMeasurementExplanation(p: { leg: IAutoOptimizerPresentationLeg }) {
  if (p.leg.measurementMode !== 'active' || p.leg.route !== 'cloud-restream') return null;
  let message =
    'This shared cloud-restream upload was measured indirectly, so the result has medium confidence.';
  if (p.leg.measurementConfidence === 'low') {
    message =
      'This shared cloud-restream upload was measured indirectly, so the result has low confidence.';
  } else if (p.leg.measurementConfidence === 'high') {
    message =
      'This shared cloud-restream upload was measured indirectly. The result has high confidence.';
  }
  return <p className={styles.estimateExplanation}>{$t(message)}</p>;
}

function SettingsList(p: { leg: IAutoOptimizerPresentationLeg }) {
  const { leg } = p;

  if (leg.managedByProvider) {
    return (
      <>
        <p>
          {$t('Twitch will manage the video and encoder settings for this stream.')}
          <MeasurementProvenance leg={leg} />
        </p>
        <EstimateExplanation leg={leg} />
        <ActiveMeasurementExplanation leg={leg} />
      </>
    );
  }

  return (
    <>
      <ul className={styles.settingsList}>
        <li>
          <i className="icon-check" aria-hidden="true" />
          {$t('Resolution')}: {leg.width}×{leg.height}
        </li>
        <li>
          <i className="icon-check" aria-hidden="true" />
          {$t('Framerate')}: {leg.fps} {$t('fps')}
        </li>
        <li>
          <i className="icon-check" aria-hidden="true" />
          {$t('Bitrate')}: {leg.bitrateKbps} Kbps
          <MeasurementProvenance leg={leg} />
        </li>
        {leg.encoder && (
          <li>
            <i className="icon-check" aria-hidden="true" />
            {$t('Encoder')}: {leg.encoder}
            {leg.preset ? ` (${leg.preset})` : ''}
          </li>
        )}
      </ul>
      <EstimateExplanation leg={leg} />
      <ActiveMeasurementExplanation leg={leg} />
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
  const allProviderManaged = p.legs.length > 0 && p.legs.every(leg => leg.managedByProvider);
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
