import React from 'react';
import { shell } from '@electron/remote';
import cx from 'classnames';
import { ModalLayout } from 'components-react/shared/ModalLayout';
import styles from './MarketingModal.m.less';
import { $t } from 'services/i18n';
import { Services } from 'components-react/service-provider';
import { useRealmObject } from 'components-react/hooks/realm';

export default function MarketingModal() {
  const { AnnouncementsService } = Services;

  const productUpdates = useRealmObject(AnnouncementsService.currentAnnouncements).productUpdates;

  function handleButton(url: string) {
    shell.openExternal(url);
  }

  return (
    <ModalLayout>
      <h2>{$t('New Updates to Streamlabs Desktop')}</h2>
      <div className={styles.separator} />
      <div className={cx(styles.cell, styles.main)}>
        <div className={styles.imageContainer}>
          <img className={styles.image} src={productUpdates[0].thumbnail} />
        </div>
        <div className={styles.info}>
          <h3>{productUpdates[0].header}</h3>
          <p>{productUpdates[0].subHeader}</p>
          <button
            className="button button--default"
            onClick={() => handleButton(productUpdates[0].link)}
          >
            {productUpdates[0].linkTitle}
          </button>
        </div>
      </div>
      <div className={styles.separator} />
      <div className={styles.subUpdates}>
        {productUpdates[1] && (
          <div className={styles.cell}>
            <div className={styles.imageContainer}>
              <img className={styles.image} src={productUpdates[1].thumbnail} />
            </div>
            <div className={styles.info}>
              <h3>{productUpdates[1].header}</h3>
              <p>{productUpdates[1].subHeader}</p>
              <button
                className="button button--default"
                onClick={() => handleButton(productUpdates[1].link)}
              >
                {productUpdates[1].linkTitle}
              </button>
            </div>
          </div>
        )}
        {productUpdates[2] && (
          <div className={styles.cell}>
            <div className={styles.imageContainer}>
              <img className={styles.image} src={productUpdates[2].thumbnail} />
            </div>
            <div className={styles.info}>
              <h3>{productUpdates[2].header}</h3>
              <p>{productUpdates[2].subHeader}</p>
              <button
                className="button button--default"
                onClick={() => handleButton(productUpdates[2].link)}
              >
                {productUpdates[2].linkTitle}
              </button>
            </div>
          </div>
        )}
      </div>
    </ModalLayout>
  );
}
