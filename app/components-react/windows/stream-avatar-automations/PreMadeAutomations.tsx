import React, { useState } from 'react';
import { Button, Switch } from 'antd';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import type { ConditionType } from 'services/stream-avatar/engine/conditions';
import type { TAutomationExport } from 'services/stream-avatar/engine/automations';
import styles from './PreMadeAutomations.m.less';

interface PreMadeItem {
  title: string;
  description: string;
  gameName: string;
  color: string;
  automation: Omit<TAutomationExport, 'id'>;
}

// ponytail: static seed data — replace with API fetch when catalog exists
const PRE_MADE: PreMadeItem[] = [
  {
    title: 'Victory Royale',
    description: 'Co-host comments on each win.',
    gameName: 'Fortnite',
    color: '#1a3a5c',
    automation: {
      description: 'Victory Royale',
      conditions: [{ type: 'fortnite.victory_royale' as ConditionType }],
      actions: [{ type: 'co-host.comment' }],
      enabled: true,
    },
  },
  {
    title: 'Enemy Knocked',
    description: 'Co-host reacts when you knock an enemy.',
    gameName: 'Fortnite',
    color: '#2d4a1e',
    automation: {
      description: 'Enemy Knocked',
      conditions: [{ type: 'fortnite.knocked' as ConditionType }],
      actions: [{ type: 'co-host.comment' }],
      enabled: true,
    },
  },
  {
    title: 'Defeat',
    description: 'Co-host reacts to each defeat.',
    gameName: 'Fortnite',
    color: '#3a1a1a',
    automation: {
      description: 'Defeat',
      conditions: [{ type: 'fortnite.defeat' as ConditionType }],
      actions: [{ type: 'co-host.comment' }],
      enabled: true,
    },
  },
  {
    title: 'Round Won',
    description: 'Co-host comments on every round win.',
    gameName: 'Valorant',
    color: '#2a1a3a',
    automation: {
      description: 'Round Won',
      conditions: [{ type: 'valorant.victory' as ConditionType }],
      actions: [{ type: 'co-host.comment' }],
      enabled: true,
    },
  },
  {
    title: 'Player Eliminated',
    description: 'Co-host reacts to each elimination.',
    gameName: 'Valorant',
    color: '#1a1a3a',
    automation: {
      description: 'Player Eliminated',
      conditions: [{ type: 'valorant.player_eliminated' as ConditionType }],
      actions: [{ type: 'co-host.comment' }],
      enabled: true,
    },
  },
];

interface Props {
  onClose: () => void;
}

export default function PreMadeAutomations({ onClose }: Props) {
  const { AutomationsService } = Services;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [enabledSet, setEnabledSet] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  function toggleItem(index: number) {
    setEnabledSet(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function goTo(index: number) {
    setCurrentIndex(index);
  }

  function prev() {
    setCurrentIndex(i => (i > 0 ? i - 1 : PRE_MADE.length - 1));
  }

  function next() {
    setCurrentIndex(i => (i < PRE_MADE.length - 1 ? i + 1 : 0));
  }

  async function handleComplete() {
    setSaving(true);
    try {
      for (const index of enabledSet) {
        await AutomationsService.actions.create(PRE_MADE[index].automation);
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const current = PRE_MADE[currentIndex];

  const footer = (
    <>
      <Button onClick={onClose} disabled={saving}>
        {$t('Cancel')}
      </Button>
      <Button
        type="primary"
        style={{ marginLeft: '8px' }}
        onClick={handleComplete}
        disabled={saving || enabledSet.size === 0}
      >
        {saving ? $t('Adding...') : $t('Complete')}
      </Button>
    </>
  );

  return (
    <ModalLayout footer={footer}>
      <div className={styles.container}>
        <div className={styles.gameIcon}>
          <i className="fa fa-gamepad" />
        </div>

        <h2 className={styles.title}>{$t('Select Pre-made Automation')}</h2>

        <div className={styles.featured}>
          <Button type="text" className={styles.navBtn} onClick={prev}>
            <i className="fa fa-chevron-left" />
          </Button>

          <div className={styles.card}>
            <div className={styles.preview} style={{ background: current.color }}>
              <span className={styles.previewLabel}>{current.gameName}</span>
            </div>
            <div className={styles.infoRow}>
              <div>
                <div className={styles.itemTitle}>{current.title}</div>
                <div className={styles.itemDesc}>{current.description}</div>
              </div>
              <Switch
                checked={enabledSet.has(currentIndex)}
                onChange={() => toggleItem(currentIndex)}
              />
            </div>
          </div>

          <Button type="text" className={styles.navBtn} onClick={next}>
            <i className="fa fa-chevron-right" />
          </Button>
        </div>

        <div className={styles.thumbnailStrip}>
          {PRE_MADE.map((item, i) => (
            <Button
              key={i}
              type="text"
              className={`${styles.thumbnail} ${i === currentIndex ? styles.thumbnailActive : ''}`}
              onClick={() => goTo(i)}
              style={{ background: item.color }}
            />
          ))}
        </div>

        <div className={styles.dots}>
          {PRE_MADE.map((_, i) => (
            <span
              key={i}
              className={`${styles.dot} ${i === currentIndex ? styles.dotActive : ''}`}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      </div>
    </ModalLayout>
  );
}
