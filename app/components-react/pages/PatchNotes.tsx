import React from 'react';
import cx from 'classnames';
import { $t } from '../../services/i18n';
import { Services } from '../service-provider';

import styles from './PatchNotes.m.less';

export default function PatchNotes(p: { className?: string }) {
  const { PatchNotesService, NavigationService } = Services;

  const notes = PatchNotesService.notes;

  function done() {
    NavigationService.navigate('Studio');
  }

  return (
    <div className={cx(styles.patchNotesPage, p.className)}>
      <div className={styles.patchNotesContainer}>
        <div className={styles.patchNotesContent}>
          <div className={styles.patchNotesHeader}>
            <div className={styles.patchNotesTitle}>{notes.title}</div>
            <div className={styles.patchNotesVersion}>{notes.version}</div>
          </div>
          <ul className={styles.patchNotesList}>
            {notes.notes.map(item => (
              <li className={styles.patchNotesItem} key={item}>
                {item}
              </li>
            ))}
          </ul>
          <button onClick={done} className={cx(styles.patchNotesButton, 'button button--action')}>
            {$t('Done')}
          </button>
        </div>
      </div>
    </div>
  );
}
