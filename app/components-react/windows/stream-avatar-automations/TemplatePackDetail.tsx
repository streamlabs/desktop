import React, { useState } from 'react';
import { Tooltip } from 'antd';
import cx from 'classnames';
import { $t } from 'services/i18n';
import type { AutomationTemplatePack } from 'services/stream-avatar/stream-avatar-api-service';
import TemplatePreview from './TemplatePreview';
import { badgeColor } from './automations-utils';
import styles from './AutomationTemplates.m.less';

interface Props {
  pack: AutomationTemplatePack;
  /** Indices of the templates that work with the user's linked platforms. */
  availableIndices: number[];
  selection: Set<number>;
  onToggleTemplate: (index: number) => void;
  onToggleAll: () => void;
}

export default function TemplatePackDetail({
  pack,
  availableIndices,
  selection,
  onToggleTemplate,
  onToggleAll,
}: Props) {
  const [previewTemplate, setPreviewTemplate] = useState<number | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);

  const total = pack.templates.length;
  const available = new Set(availableIndices);
  const addedCount = availableIndices.filter(i => selection.has(i)).length;
  const allSelected = availableIndices.length > 0 && addedCount === availableIndices.length;

  const subtitleParams = { count: total, added: addedCount, total: availableIndices.length };
  const subtitle =
    total === 1
      ? $t('%{count} event · %{added} of %{total} added', subtitleParams)
      : $t('%{count} events · %{added} of %{total} added', subtitleParams);

  function startPreview(index: number) {
    setPreviewTemplate(index);
    setPreviewNonce(n => n + 1);
  }

  // Back to the pack's looping default preview.
  function stopPreview() {
    setPreviewTemplate(null);
    setPreviewNonce(n => n + 1);
  }

  return (
    <div className={styles.detail}>
      <div className={styles.banner}>
        {/* A layer, not background-image: game pack art is often .webm, which CSS can't paint. */}
        <TemplatePreview
          src={pack.bannerUrl || pack.imageUrl}
          className={styles.bannerMedia}
          // The banner is a still in Figma; the preview panel below is where video plays.
          playing={false}
        />
        <span className={styles.badge} style={{ background: badgeColor(pack.name) }}>
          {pack.name.charAt(0)}
        </span>
        <div className={styles.bannerText}>
          <div className={styles.bannerName}>{pack.name}</div>
          <div className={styles.bannerSub}>{subtitle}</div>
        </div>
      </div>

      <div className={styles.mainRow}>
        <div className={styles.coverPanel}>
          <TemplatePreview
            src={previewTemplate !== null ? pack.templates[previewTemplate]?.gifUrl : pack.gifUrl}
            className={styles.coverVideo}
            muted={previewTemplate === null}
            loop={previewTemplate === null}
            onEnded={stopPreview}
            playToken={previewNonce}
          />
        </div>

        <div className={styles.checklistPanel}>
          <div className={styles.checklistHeader}>
            <span>{$t('Events that will trigger automations')}</span>
            {availableIndices.length > 0 && (
              <a onClick={onToggleAll}>{allSelected ? $t('De-Select all') : $t('Select all')}</a>
            )}
          </div>
          <div className={styles.checklist}>
            {pack.templates.map((item, i) => {
              const selected = selection.has(i);
              const unavailable = !available.has(i);
              const previewing = previewTemplate === i;
              return (
                <Tooltip
                  key={i}
                  title={unavailable ? $t('Link a platform to use this') : undefined}
                >
                  <div
                    className={cx(styles.checklistRow, {
                      [styles.checklistRowActive]: previewing,
                      [styles.checklistRowUnavailable]: unavailable,
                    })}
                    onClick={() => !unavailable && onToggleTemplate(i)}
                  >
                    <TemplatePreview
                      src={selected ? item.gifUrl : item.imageUrl}
                      className={styles.rowThumb}
                      playing={selected}
                    />
                    <div className={styles.rowText}>
                      <div className={styles.rowTitle}>{item.title}</div>
                      <div className={styles.rowDesc}>{item.description}</div>
                    </div>
                    <div
                      className={cx(styles.rowPlay, { [styles.rowPause]: previewing })}
                      onClick={e => {
                        e.stopPropagation();
                        if (previewing) stopPreview();
                        else startPreview(i);
                      }}
                    >
                      <i className={previewing ? 'icon-pause' : 'icon-play-round'} />
                    </div>
                    <div className={cx(styles.rowCheck, { [styles.rowCheckActive]: selected })}>
                      {selected && <i className="icon-check-mark" />}
                    </div>
                  </div>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
