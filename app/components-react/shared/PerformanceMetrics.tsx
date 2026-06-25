import React, { useCallback, useMemo, memo } from 'react';
import { Tooltip } from 'antd';
import cx from 'classnames';
import { useVuex } from '../hooks';
import { Services } from '../service-provider';
import styles from './PerformanceMetrics.m.less';
import { $t } from '../../services/i18n';
import { useRealmObject } from 'components-react/hooks/realm';
import { IPinnedStatistics } from 'services/customization';
import { getPerformanceMetricMetadata } from './performance-metrics';

type TPerformanceMetricsMode = 'full' | 'limited';

function pinTooltip(mode: TPerformanceMetricsMode, stat: string) {
  return mode === 'full' ? $t('Click to add %{stat} info to your footer', { stat }) : '';
}

function classForStat(mode: TPerformanceMetricsMode, isPinned: boolean) {
  if (mode === 'limited') return '';
  return `clickable ${isPinned ? 'active' : ''}`;
}

function showLabel(mode: TPerformanceMetricsMode, attribute: string) {
  if (attribute !== 'droppedFrames') return true;
  return mode === 'full';
}

export default memo(function PerformanceMetrics(props: {
  mode: TPerformanceMetricsMode;
  className?: string;
}) {
  const { CustomizationService, PerformanceService, StreamingService } = Services;

  const pinnedStats = useRealmObject(CustomizationService.state.pinnedStatistics);

  const v = useVuex(
    () => ({
      cpuPercent: PerformanceService.views.cpuPercent,
      frameRate: PerformanceService.views.frameRate,
      droppedFrames: PerformanceService.views.droppedFrames,
      percentDropped: PerformanceService.views.percentDropped,
      bandwidth: PerformanceService.views.bandwidth,
      bandwidthByDisplay: PerformanceService.views.bandwidthByDisplay,
      isDualOutputMode: StreamingService.views.isDualOutputMode,
    }),
    false,
  );

  const metadata = useMemo(
    () => getPerformanceMetricMetadata(v, $t),
    [
      v.bandwidth,
      v.bandwidthByDisplay.horizontal,
      v.bandwidthByDisplay.vertical,
      v.cpuPercent,
      v.droppedFrames,
      v.frameRate,
      v.isDualOutputMode,
      v.percentDropped,
    ],
  );

  const shownCells = useMemo(
    () => metadata.filter(metric => props.mode === 'full' || pinnedStats[metric.attribute]),
    [metadata, props.mode, pinnedStats],
  );

  const updatePinnedStats = useCallback(
    (key: keyof IPinnedStatistics, value: boolean) => {
      if (props.mode === 'limited') return;
      CustomizationService.actions.setSettings({ pinnedStatistics: { [key]: value } });
    },
    [props.mode, CustomizationService.actions],
  );

  return (
    <div
      className={cx(
        styles.performanceMetrics,
        'performance-metrics',
        'flex flex--center',
        props.className,
      )}
    >
      {shownCells.map(data => {
        return (
          <MetricItem
            key={`metric-${data.key}`}
            mode={props.mode}
            attribute={data.attribute}
            value={data.value}
            label={data.label}
            icon={data.icon}
            isPinned={pinnedStats[data.attribute]}
            onToggle={updatePinnedStats}
          />
        );
      })}
    </div>
  );
});

interface IMetricItemProps {
  attribute: keyof IPinnedStatistics;
  value: string | number;
  label: string;
  icon: string;
  mode: TPerformanceMetricsMode;
  isPinned: boolean;
  onToggle: (attribute: keyof IPinnedStatistics, value: boolean) => void;
}

const MetricItem = memo((p: IMetricItemProps) => {
  const handleClick = useCallback(() => {
    p.onToggle(p.attribute, !p.isPinned);
  }, [p.attribute, p.isPinned, p.onToggle]);

  return (
    <Tooltip placement="bottom" title={pinTooltip(p.mode, p.label)} key={p.attribute}>
      <span
        className={cx(
          styles.performanceMetricWrapper,
          classForStat(p.mode, p.isPinned),
          'performance-metric-wrapper',
        )}
        onClick={handleClick}
      >
        <i className={cx(styles.performanceMetricIcon, p.icon)} />
        <span className={styles.performanceMetric}>
          <span className={styles.performanceMetricValue} role={`metric-${p.attribute}`}>
            {p.value}
          </span>
          {showLabel(p.mode, p.attribute) && (
            <span className={styles.performanceMetricLabel}> {p.label}</span>
          )}
        </span>
      </span>
    </Tooltip>
  );
});
