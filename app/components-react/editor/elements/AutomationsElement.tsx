import React, { useEffect, useRef, useState } from 'react';
import { Spin, Switch, Tooltip } from 'antd';
import Scrollable from 'components-react/shared/Scrollable';
import { useVuex } from 'components-react/hooks';
import { Services } from 'components-react/service-provider';
import { $t } from 'services/i18n';
import { Conditions } from 'services/stream-avatar/engine/conditions';
import type { TAutomationExport } from 'services/stream-avatar/engine/automations';
import useBaseElement from './hooks';
import styles from './AutomationsElement.m.less';

const mins = { x: 220, y: 120 };

function conditionLabel(automation: TAutomationExport) {
  const c = automation.conditions[0];
  if (!c?.type) return '';
  const def = Conditions[c.type as keyof typeof Conditions];
  return def ? def.label : c.type;
}

function AutomationsContent() {
  const { AutomationsService, AutomationsEngineService } = Services;
  const { automations, loading } = useVuex(() => ({
    automations: AutomationsService.state.automations,
    loading: AutomationsService.state.loading,
  }));

  const [simulatingId, setSimulatingId] = useState<number | null>(null);

  useEffect(() => {
    AutomationsService.actions.fetchAll();
  }, []);

  async function simulate(e: React.MouseEvent, id: number) {
    e.stopPropagation();
    if (simulatingId !== null) return;
    setSimulatingId(id);
    try {
      await AutomationsEngineService.actions.return.simulateAutomation(id);
    } finally {
      setSimulatingId(null);
    }
  }

  function toggleEnabled(automation: TAutomationExport) {
    if (!automation.id) return;
    AutomationsService.actions.update(automation.id, {
      ...automation,
      enabled: !automation.enabled,
    });
  }

  function openCreate() {
    AutomationsService.actions.showCreateAutomation();
  }

  if (loading) {
    return (
      <div className={styles.center}>
        <Spin size="small" />
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.topBar}>
        <span className={styles.title}>{$t('Automations')}</span>
        <Tooltip title={$t('Add Automation')}>
          <i className="icon-add-circle icon-button icon-button--lg" onClick={openCreate} />
        </Tooltip>
      </div>

      {automations.length === 0 ? (
        <div className={styles.empty}>
          <span>{$t('No automations yet.')}</span>
        </div>
      ) : (
        <Scrollable className={styles.list}>
          {automations.map(automation => (
            <div
              key={automation.id}
              className={styles.row}
              onClick={() =>
                automation.id != null &&
                AutomationsService.actions.showAutomationEditor(automation.id)
              }
            >
              <div className={styles.rowInfo}>
                <span className={styles.name}>
                  {automation.description || $t('(no description)')}
                </span>
                <span className={styles.condition}>{conditionLabel(automation)}</span>
              </div>
              <div className={styles.rowActions} onClick={e => e.stopPropagation()}>
                {simulatingId === automation.id ? (
                  <Spin size="small" />
                ) : (
                  <Tooltip title={$t('Test')}>
                    <i
                      className={`icon-play-round ${simulatingId !== null ? styles.disabled : ''}`}
                      onClick={e => automation.id != null && simulate(e, automation.id)}
                    />
                  </Tooltip>
                )}
                <Switch
                  size="small"
                  checked={automation.enabled}
                  onChange={() => toggleEnabled(automation)}
                />
              </div>
            </div>
          ))}
        </Scrollable>
      )}
    </div>
  );
}

export function AutomationsElement() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { renderElement } = useBaseElement(<AutomationsContent />, mins, containerRef.current);

  return (
    <div ref={containerRef} style={{ height: '100%' }}>
      {renderElement()}
    </div>
  );
}

AutomationsElement.mins = mins;
