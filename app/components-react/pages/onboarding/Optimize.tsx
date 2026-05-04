import { useModule } from 'slap';
import { Services } from 'components-react/service-provider';
import AutoProgressBar from 'components-react/shared/AutoProgressBar';
import React, { useEffect, useRef, useState } from 'react';
import {
  IAutoConfigSummary,
  IBandwidthResult,
  IConfigProgress,
  IEncoderDetection,
  ISelectionDecision,
  IVideoDecision,
  TBindingCap,
} from 'services/auto-config';
import { $t } from 'services/i18n';
import commonStyles from './Common.m.less';
import { OnboardingModule } from './Onboarding';

interface IConfigStepPresentation {
  description: string;
  summary: string;
  percentage?: number;
}

export function Optimize() {
  const { AutoConfigService, RecordingModeService, OutputSettingsService } = Services;
  // 'done' is dev-only — production should auto-advance like before. Kept here
  // while V2 autoconfig is being validated so devs can inspect the trace.
  const [optimizingState, setOptimizingState] = useState<
    'initial' | 'running' | 'done' | 'error'
  >('initial');
  const [stepInfo, setStepInfo] = useState<IConfigStepPresentation | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [copyStatus, setCopyStatus] = useState<string>('');
  const logScrollRef = useRef<HTMLDivElement | null>(null);

  // V2 summary card state. Per-target arrays accumulate by id so out-of-order
  // events don't drop data; the final summary backfills any missed pieces.
  const [encoderDetection, setEncoderDetection] = useState<IEncoderDetection | null>(null);
  const [videoDecisions, setVideoDecisions] = useState<IVideoDecision[]>([]);
  const [bandwidthByTarget, setBandwidthByTarget] = useState<Record<number, IBandwidthResult>>({});
  const [selectionByTarget, setSelectionByTarget] = useState<Record<number, ISelectionDecision>>({});
  const [summary, setSummary] = useState<IAutoConfigSummary | null>(null);
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
    (optimizingState === 'running' || optimizingState === 'done') && stepInfo
      ? (steps.indexOf(stepInfo.description) + 1) / steps.length
      : 0;
  const { setProcessing, next } = useModule(OnboardingModule);

  // Auto-scroll the log to the bottom as new lines come in.
  useEffect(() => {
    if (logScrollRef.current) {
      logScrollRef.current.scrollTop = logScrollRef.current.scrollHeight;
    }
  }, [logLines]);

  function appendLog(line: string) {
    const ts = new Date().toLocaleTimeString();
    setLogLines(prev => [...prev, `[${ts}] ${line}`]);
  }

  async function copyLog() {
    const text = logLines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus($t('Copied'));
    } catch (e) {
      setCopyStatus($t('Copy failed'));
    }
    window.setTimeout(() => setCopyStatus(''), 1500);
  }

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

  function formatFps(d: { fpsNum: number; fpsDen: number }) {
    if (!d.fpsDen) return `${d.fpsNum}/0`;
    const v = d.fpsNum / d.fpsDen;
    // Show one decimal for non-integer rates (e.g. 29.97), integer otherwise.
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  }

  function formatRes(d: { cx: number; cy: number; fpsNum: number; fpsDen: number }) {
    return `${d.cx}×${d.cy}@${formatFps(d)}`;
  }

  function bindingCapReason(d: ISelectionDecision): string {
    const cap: TBindingCap = d.bindingCap;
    if (cap === 'user') return $t('User-set bitrate');
    if (cap === 'heuristic') return $t('OBS quality recommendation');
    if (cap === 'measured') return $t('Capped by measured network');
    if (cap === 'platform') return $t('Capped by platform limit');
    return cap;
  }

  function snapshotEncoderSettings(label: string) {
    try {
      const settings = OutputSettingsService.getSettings();
      appendLog(
        `${label} — mode=${settings.mode} streaming=${JSON.stringify(settings.streaming)}`,
      );
    } catch (e) {
      appendLog(`${label} — failed to read settings: ${String(e)}`);
    }
  }

  function optimize() {
    setOptimizingState('running');
    setProcessing(true);
    setLogLines([]);
    setEncoderDetection(null);
    setVideoDecisions([]);
    setBandwidthByTarget({});
    setSelectionByTarget({});
    setSummary(null);

    appendLog('Optimize.optimize() invoked');
    snapshotEncoderSettings('Encoder settings BEFORE');

    const diagSub = AutoConfigService.diagnosticLog.subscribe(line => {
      appendLog(line);
    });

    // V2 typed event subscriptions. The summary fires before the configProgress
    // 'done' event (see auto-config/index.ts handleProgress reordering), so by
    // the time we unsubscribe below, all of these have already delivered.
    const encSub = AutoConfigService.encoderDetection.subscribe(d => setEncoderDetection(d));
    const vidSub = AutoConfigService.videoDecision.subscribe(d =>
      setVideoDecisions(prev => [...prev, d]),
    );
    const bwSub = AutoConfigService.bandwidthResult.subscribe(d =>
      setBandwidthByTarget(prev => ({ ...prev, [d.targetId]: d })),
    );
    const selSub = AutoConfigService.selectionDecision.subscribe(d =>
      setSelectionByTarget(prev => ({ ...prev, [d.targetId]: d })),
    );
    const sumSub = AutoConfigService.summary.subscribe(s => {
      setSummary(s);
      // Backfill from the consolidated summary in case any per-target events
      // were missed or arrived in an order that lost data.
      if (s.encoderDetection) setEncoderDetection(s.encoderDetection);
      if (s.videoDecision?.perCanvas) setVideoDecisions(s.videoDecision.perCanvas);
      if (s.bandwidthTest?.perTarget?.length) {
        setBandwidthByTarget(
          Object.fromEntries(s.bandwidthTest.perTarget.map(t => [t.targetId, t])),
        );
      }
      if (s.selection?.perTarget?.length) {
        setSelectionByTarget(
          Object.fromEntries(s.selection.perTarget.map(t => [t.targetId, t])),
        );
      }
    });

    function unsubAll() {
      sub.unsubscribe();
      diagSub.unsubscribe();
      encSub.unsubscribe();
      vidSub.unsubscribe();
      bwSub.unsubscribe();
      selSub.unsubscribe();
      sumSub.unsubscribe();
    }

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
        snapshotEncoderSettings('Encoder settings AFTER');
        appendLog('AutoConfig finished. Press Continue to proceed.');
        unsubAll();
        // Dev-mode: do NOT auto-advance. Surface the trace and wait for user
        // to click Continue. Restore `next()` here once we're done debugging.
        setOptimizingState('done');
      } else {
        appendLog(`AutoConfigService error: ${progress.description}`);
        setProcessing(false);
        snapshotEncoderSettings('Encoder settings AFTER (error path)');
        unsubAll();
        setOptimizingState('error');
      }
    });

    RecordingModeService.views.isRecordingModeEnabled
      ? AutoConfigService.actions.startRecording()
      : AutoConfigService.actions.start();
  }

  function handleButtonClick() {
    if (optimizingState === 'initial') {
      optimize();
    } else {
      // 'done' or 'error' — advance onboarding.
      next();
    }
  }

  function buttonLabel() {
    if (optimizingState === 'initial') return $t('Start');
    if (optimizingState === 'done') return $t('Continue');
    return $t('Ok');
  }

  function titleLabel() {
    if (optimizingState === 'running') return $t('Optimizing...');
    if (optimizingState === 'initial') return $t('Optimize');
    if (optimizingState === 'done') return $t('Optimize (dev)');
    return $t('Error');
  }

  const showLogPanel = logLines.length > 0;
  const bandwidthList = Object.values(bandwidthByTarget);
  const selectionList = Object.values(selectionByTarget);
  const showSummaryCard =
    !!encoderDetection ||
    videoDecisions.length > 0 ||
    bandwidthList.length > 0 ||
    selectionList.length > 0 ||
    !!summary;

  const sectionStyle: React.CSSProperties = {
    background: 'var(--section)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: 8,
    marginTop: 8,
    fontSize: 12,
    lineHeight: 1.5,
  };
  const sectionHeaderStyle: React.CSSProperties = {
    fontWeight: 600,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    opacity: 0.7,
    marginBottom: 6,
  };
  const rowStyle: React.CSSProperties = {
    display: 'flex',
    gap: 12,
    fontFamily:
      'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 11,
  };

  return (
    <div>
      <h1 className={commonStyles.titleContainer}>{titleLabel()}</h1>
      {(optimizingState === 'initial' || optimizingState === 'error') && (
        <div style={{ width: '60%', margin: 'auto', textAlign: 'center' }}>
          {optimizingState === 'initial'
            ? $t(
                "Click below and we'll analyze your internet speed and computer hardware to give you the best settings possible.",
              )
            : $t(
                'An error has occurred during optimization attempt. Only default settings are applied',
              )}
        </div>
      )}
      {(optimizingState === 'running' || optimizingState === 'done') && (
        <div style={{ margin: 'auto', marginTop: 24, width: '80%' }}>
          <AutoProgressBar percent={percentage * 100} timeTarget={1000 * 60} />
          <span>{stepInfo && stepInfo.summary}</span>
        </div>
      )}
      {showSummaryCard && (
        <div style={{ width: '90%', margin: '16px auto 0' }}>
          {encoderDetection && (
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle}>{$t('Encoder')}</div>
              <div style={rowStyle}>
                <span>
                  {$t('Streaming')}: <b>{encoderDetection.chosenStreamingEncoder || '—'}</b>
                </span>
                <span>
                  {$t('Recording')}: <b>{encoderDetection.chosenRecordingEncoder || '—'}</b>
                </span>
                <span>
                  {$t('Quality')}: <b>{encoderDetection.recordingQuality}</b>
                </span>
              </div>
              <div style={{ ...rowStyle, marginTop: 4, opacity: 0.8 }}>
                <span>HW: {encoderDetection.hardwareEncodingAvailable ? 'yes' : 'no'}</span>
                <span>nvenc: {encoderDetection.nvenc ? '✓' : '·'}</span>
                <span>qsv: {encoderDetection.qsv ? '✓' : '·'}</span>
                <span>vce: {encoderDetection.vce ? '✓' : '·'}</span>
                <span>apple: {encoderDetection.apple ? '✓' : '·'}</span>
                <span>sw tested: {encoderDetection.softwareTested ? '✓' : '·'}</span>
              </div>
            </div>
          )}

          {videoDecisions.length > 0 && (
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle}>
                {$t('Video')}
                {summary?.videoDecision?.chosen && (
                  <span style={{ marginLeft: 8, opacity: 0.7, fontWeight: 400 }}>
                    {$t('chose')} {formatRes(summary.videoDecision.chosen)}
                  </span>
                )}
              </div>
              {videoDecisions.map((d, i) => (
                <div key={`${d.contextPtr}-${i}`} style={rowStyle}>
                  <span style={{ opacity: 0.6 }}>{d.contextPtr.slice(0, 10)}</span>
                  <span>
                    {formatRes(d.before)} → {formatRes(d.after)}
                  </span>
                  <span style={{ opacity: 0.7 }}>
                    {d.skipped
                      ? $t('skipped (no-op)')
                      : `ret=${d.obsSetVideoInfoRet}`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {bandwidthList.length > 0 && (
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle}>{$t('Bandwidth')}</div>
              {bandwidthList.map(b => {
                const dropPct = b.totalFrames
                  ? ((b.droppedFrames / b.totalFrames) * 100).toFixed(1)
                  : '0';
                const drops = b.droppedFrames > 0;
                return (
                  <div key={b.targetId} style={rowStyle}>
                    <span style={{ opacity: 0.6 }}>#{b.targetId}</span>
                    <span>
                      <b>{b.measuredKbps}</b> kbps
                      <span style={{ opacity: 0.6 }}> / tested {b.testBitrate}</span>
                    </span>
                    <span style={{ color: drops ? 'var(--red, #e74c3c)' : undefined }}>
                      drops {b.droppedFrames}/{b.totalFrames} ({dropPct}%)
                    </span>
                    <span style={{ opacity: 0.7 }}>{b.elapsedMs}ms</span>
                    <span style={{ opacity: 0.6, wordBreak: 'break-all' }}>{b.serverTested}</span>
                  </div>
                );
              })}
            </div>
          )}

          {selectionList.length > 0 && (
            <div style={sectionStyle}>
              <div style={sectionHeaderStyle}>{$t('Selection')}</div>
              {selectionList.map(s => (
                <div key={s.targetId} style={{ ...rowStyle, flexWrap: 'wrap' }}>
                  <span style={{ opacity: 0.6 }}>#{s.targetId}</span>
                  <span>
                    {s.userBitrate} → <b>{s.picked}</b> kbps
                  </span>
                  <span style={{ opacity: 0.8 }}>({bindingCapReason(s)})</span>
                  {s.encoderChanged && (
                    <span style={{ opacity: 0.7 }}>
                      enc: {s.currentEncoderId || '—'} → <b>{s.chosenEncoderId}</b>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          {summary && !summary.complete && (
            <div style={{ ...sectionStyle, opacity: 0.6 }}>
              {$t('Summary returned complete=false; some data may be missing.')}
            </div>
          )}
        </div>
      )}
      {showLogPanel && (
        <div style={{ width: '90%', margin: '16px auto 0' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              marginBottom: 4,
            }}
          >
            <span style={{ fontSize: 11, opacity: 0.6, alignSelf: 'center' }}>
              {copyStatus || `${logLines.length} lines`}
            </span>
            <button
              type="button"
              onClick={copyLog}
              style={{
                fontSize: 11,
                padding: '2px 8px',
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 3,
                color: 'var(--paragraph)',
                cursor: 'pointer',
              }}
            >
              {$t('Copy')}
            </button>
          </div>
          <div
            ref={logScrollRef}
            style={{
              maxHeight: 280,
              overflowY: 'auto',
              background: 'var(--section)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: 8,
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: 11,
              lineHeight: 1.4,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              // Electron disables text selection globally on .app shells; force
              // it back on inside the log so devs can highlight + Ctrl+C lines.
              userSelect: 'text',
              WebkitUserSelect: 'text',
              cursor: 'text',
            }}
          >
            {logLines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </div>
      )}
      {optimizingState !== 'running' && (
        <button
          className={commonStyles.optionCard}
          onClick={handleButtonClick}
          style={{ margin: 'auto', marginTop: 16 }}
        >
          <h2 style={{ color: 'var(--action-button-text)' }}>{buttonLabel()}</h2>
        </button>
      )}
    </div>
  );
}
