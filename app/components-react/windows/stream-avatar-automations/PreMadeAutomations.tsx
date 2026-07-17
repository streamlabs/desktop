import React, { useEffect, useState } from 'react';
import { Spin } from 'antd';
import cx from 'classnames';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import type { AutomationTemplateGame } from 'services/stream-avatar/stream-avatar-api-service';
import PreMadeAutomationsFooter from './PreMadeAutomationsFooter';
import TemplatePreview from './TemplatePreview';
import { badgeColor } from './automations-utils';
import { applyTemplates } from './automationTemplates';
import styles from './PreMadeAutomations.m.less';

interface Props {
  onCancel: () => void;
  onSaved?: () => void;
  variant: 'welcome' | 'templatePicker';
}

export default function PreMadeAutomations({ onCancel, onSaved, variant }: Props) {
  const { StreamAvatarApiService } = Services;
  const [games, setGames] = useState<AutomationTemplateGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeGameIndex, setActiveGameIndex] = useState(0);
  const [selections, setSelections] = useState<Record<string, Set<number>>>({});
  const [saving, setSaving] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<number | null>(null);
  const [previewNonce, setPreviewNonce] = useState(0);

  useEffect(() => {
    StreamAvatarApiService.getAutomationTemplates()
      .then(setGames)
      .finally(() => setLoading(false));
  }, []);

  const carouselGames = games.slice(0, 3);

  const activeGame: AutomationTemplateGame | undefined = games[activeGameIndex];
  const activeSelection = (activeGame && selections[activeGame.game]) ?? new Set<number>();

  function setGameSelection(gameKey: string, next: Set<number>) {
    setSelections(prev => ({ ...prev, [gameKey]: next }));
  }

  function toggleTemplate(index: number) {
    if (!activeGame) return;
    const next = new Set(activeSelection);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setGameSelection(activeGame.game, next);
  }

  function toggleSelectAll() {
    if (!activeGame) return;
    const allSelected = activeSelection.size === activeGame.templates.length;
    setGameSelection(
      activeGame.game,
      allSelected ? new Set() : new Set(activeGame.templates.map((_, i) => i)),
    );
  }

  function toggleGameSelection(game: AutomationTemplateGame) {
    const current = selections[game.game]?.size ?? 0;
    setGameSelection(game.game, current > 0 ? new Set() : new Set(game.templates.map((_, i) => i)));
  }

  const totalSelected = Object.values(selections).reduce((sum, set) => sum + set.size, 0);

  async function handleComplete() {
    setSaving(true);
    try {
      await applyTemplates(selections, games);
    } finally {
      setSaving(false);
    }
    onSaved?.();
  }

  const footer = (
    <PreMadeAutomationsFooter
      totalSelected={totalSelected}
      saving={saving}
      onCancel={onCancel}
      onComplete={handleComplete}
      cancelLabel={variant === 'welcome' ? $t('Skip') : undefined}
    />
  );

  const content = (
    <div className={styles.container}>
      {loading || !activeGame ? (
        <Spin />
      ) : (
        <>
          {carouselGames.length > 1 && (
            <>
              <div className={styles.gameCards}>
                {carouselGames.map((game, i) => {
                  const selectedCount = selections[game.game]?.size ?? 0;
                  return (
                    <div
                      key={game.game}
                      className={cx(styles.gameCard, {
                        [styles.gameCardActive]: i === activeGameIndex,
                      })}
                      onClick={() => setActiveGameIndex(i)}
                    >
                      <div className={styles.gameCardThumb}>
                        <TemplatePreview
                          src={
                            i === activeGameIndex
                              ? game.templates[0]?.gifUrl
                              : game.templates[0]?.imageUrl
                          }
                          className={styles.gameCardVideo}
                        />
                        <span
                          className={styles.gameCardBadge}
                          style={{ background: badgeColor(game.gameName) }}
                        >
                          {game.gameName[0]}
                        </span>
                        <span className={styles.gameCardName}>{game.gameName}</span>
                        <div
                          className={cx(styles.gameCardCheck, {
                            [styles.gameCardCheckActive]: selectedCount > 0,
                          })}
                          onClick={e => {
                            e.stopPropagation();
                            toggleGameSelection(game);
                          }}
                        >
                          {selectedCount > 0 && <i className="icon-check-mark" />}
                        </div>
                        <div className={styles.gameCardSub}>
                          {selectedCount > 0
                            ? $t('%{count} of %{total} added', {
                                count: selectedCount,
                                total: game.templates.length,
                              })
                            : $t('%{count} automations', { count: game.templates.length })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <div className={styles.mainRow}>
            <div className={styles.coverPanel}>
              <TemplatePreview
                src={
                  previewTemplate !== null
                    ? activeGame.templates[previewTemplate]?.gifUrl
                    : activeGame.templates[0]?.gifUrl
                }
                className={styles.coverVideo}
                muted={previewTemplate === null}
                loop={previewTemplate === null}
                onEnded={() => {
                  setPreviewTemplate(null);
                  setPreviewNonce(n => n + 1);
                }}
                playToken={previewNonce}
              />
              <div className={styles.coverTopOverlay}>
                <span
                  className={styles.badge}
                  style={{ background: badgeColor(activeGame.gameName) }}
                >
                  {activeGame.gameName[0]}
                </span>
                <span className={styles.coverGameName}>{activeGame.gameName}</span>
              </div>
              <div className={styles.coverBottomOverlay}>
                {$t('%{count} automations', { count: activeGame.templates.length })}
              </div>
            </div>

            <div className={styles.checklistPanel}>
              <div className={styles.checklistHeader}>
                <span>{$t('Events that will trigger automations')}</span>
                <a onClick={toggleSelectAll}>
                  {activeSelection.size === activeGame.templates.length
                    ? $t('De-Select all')
                    : $t('Select all')}
                </a>
              </div>
              <div className={styles.checklist}>
                {activeGame.templates.map((item, i) => (
                  <div
                    key={i}
                    className={cx(styles.checklistRow, {
                      [styles.checklistRowActive]: activeSelection.has(i),
                    })}
                    onClick={() => toggleTemplate(i)}
                  >
                    <TemplatePreview
                      src={activeSelection.has(i) ? item.gifUrl : item.imageUrl}
                      className={styles.rowThumb}
                    />
                    <div className={styles.rowText}>
                      <div className={styles.rowTitle}>{item.title}</div>
                      <div className={styles.rowDesc}>{item.description}</div>
                    </div>
                    {previewTemplate !== i && (
                      <div
                        className={styles.rowPlay}
                        onClick={e => {
                          e.stopPropagation();
                          setPreviewTemplate(i);
                          setPreviewNonce(n => n + 1);
                        }}
                      >
                        <i className="icon-play-round" />
                      </div>
                    )}
                    <div
                      className={cx(styles.rowCheck, {
                        [styles.rowCheckActive]: activeSelection.has(i),
                      })}
                    >
                      {activeSelection.has(i) && <i className="icon-check-mark" />}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );

  return (
    <ModalLayout footer={footer} scrollable>
      <div className={styles.brandHeader}>
        <h1 className={styles.brandTitle}>
          {variant === 'welcome' ? $t('Welcome to Automations') : $t('Select from Templates')}
        </h1>
        {variant === 'welcome' && (
          <p className={styles.brandSubtitle}>
            {$t(
              'Automatically trigger stream effects in response to game events. Select from templates or skip to start from scratch.',
            )}
          </p>
        )}
      </div>
      {content}
    </ModalLayout>
  );
}
